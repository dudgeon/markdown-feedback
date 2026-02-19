import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import {
  getSidecarPath,
  readSidecar,
  writeSidecar,
  deleteSidecar,
  acceptAllChanges,
} from './sidecarManager'

type FileMode = 'criticmarkup' | 'sidecar'

interface WebViewMessage {
  type: string
  markup?: string
  comments?: Record<string, string>
}

/**
 * CustomTextEditorProvider for .md files.
 *
 * VS Code owns the TextDocument (dirty state, Cmd+S, file write) and the
 * extension host mediates content between disk and the WebView.
 *
 * File mode A (criticmarkup, default):
 *   .md file IS the CriticMarkup document. Round-trips perfectly.
 *
 * File mode B (sidecar):
 *   .md = clean markdown (accept-all). .criticmark JSON sidecar = { markup, comments, savedAt }.
 */
export class MarkdownFeedbackEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly context: vscode.ExtensionContext
  private readonly statusBar: vscode.StatusBarItem
  private openPanelCount = 0

  constructor(context: vscode.ExtensionContext) {
    this.context = context
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.statusBar.tooltip = 'Markdown Feedback file mode'
    context.subscriptions.push(this.statusBar)
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.openPanelCount++
    this.updateStatusBar()

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }

    webviewPanel.webview.html = this.getWebviewHtml()

    // Pending resolve for the onWillSaveTextDocument pre-save hook.
    // Receives fresh markup+comments from the WebView synchronously before disk write.
    let pendingSaveResolve:
      | ((markup: string, comments: Record<string, string>) => void)
      | null = null

    // ── Message handler (WebView → Host) ────────────────────────────────────
    webviewPanel.webview.onDidReceiveMessage(async (msg: WebViewMessage) => {
      switch (msg.type) {
        case 'ready': {
          // WebView has loaded — send platform info then file content
          const fileMode = this.getFileMode()
          webviewPanel.webview.postMessage({
            type: 'platformCapabilities',
            platform: 'vscode',
            fileMode,
          })
          const { markup, comments } = await this.loadContent(document, fileMode)
          webviewPanel.webview.postMessage({
            type: 'loadDocument',
            markup,
            comments,
            filePath: document.uri.fsPath,
          })
          break
        }

        case 'documentChanged': {
          const markup = msg.markup ?? ''
          const comments = msg.comments ?? {}

          if (pendingSaveResolve) {
            // This documentChanged is the response to saveRequested —
            // resolve the pre-save hook with the latest content
            pendingSaveResolve(markup, comments)
            pendingSaveResolve = null
          } else {
            // Normal debounced auto-save: update the TextDocument (marks file dirty)
            await this.applyEdit(document, this.getFileMode(), markup, comments)
          }
          break
        }
      }
    })

    // ── Pre-save hook: flush latest WebView state before VS Code writes disk ─
    //
    // VS Code calls onWillSaveTextDocument before writing the file. We use
    // waitUntil() to pause the write, request fresh content from the WebView,
    // then resolve with TextEdits that replace the document content.
    const willSaveDisposable = vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return

      const fileMode = this.getFileMode()

      e.waitUntil(
        new Promise<vscode.TextEdit[]>((resolve) => {
          pendingSaveResolve = async (markup, comments) => {
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            )

            if (fileMode === 'sidecar') {
              // Write the full state to the .criticmark sidecar
              await writeSidecar(document.uri.fsPath, { markup, comments, savedAt: Date.now() })
              // Write clean markdown (accept-all) to the .md TextDocument
              resolve([vscode.TextEdit.replace(fullRange, acceptAllChanges(markup))])
            } else {
              // Mode A: write CriticMarkup directly to the .md file
              resolve([vscode.TextEdit.replace(fullRange, markup)])
            }
          }

          webviewPanel.webview.postMessage({ type: 'saveRequested' })

          // Timeout: if the WebView doesn't respond in time (e.g. it's hidden),
          // fall through and let VS Code write whatever is currently in the document
          setTimeout(() => {
            if (pendingSaveResolve) {
              pendingSaveResolve = null
              resolve([])
            }
          }, 1500)
        })
      )
    })

    // ── Config change: handle file mode switching ─────────────────────────────
    const configDisposable = vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration('markdownFeedback.fileMode')) return

      const newMode = this.getFileMode()
      this.updateStatusBar()

      if (newMode === 'criticmarkup') {
        // B → A: offer to delete the sidecar if one exists
        const sidecarPath = getSidecarPath(document.uri.fsPath)
        if (fs.existsSync(sidecarPath)) {
          const choice = await vscode.window.showWarningMessage(
            `Switched to CriticMarkup mode. The .criticmark sidecar is no longer needed. Delete it?`,
            { modal: true },
            'Delete Sidecar',
            'Keep File'
          )
          if (choice === 'Delete Sidecar') {
            await deleteSidecar(document.uri.fsPath)
          }
        }
      } else {
        // A → B: inform user that the sidecar will be created on next save
        vscode.window.showInformationMessage(
          'Switched to Sidecar mode. A .criticmark file will be created alongside your .md on next save.'
        )
      }
    })

    // ── External file change: reload WebView content ─────────────────────────
    // Handles cases like git checkout or another editor modifying the file
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return
      if (
        e.reason === vscode.TextDocumentChangeReason.Undo ||
        e.reason === vscode.TextDocumentChangeReason.Redo
      )
        return

      const { markup, comments } = await this.loadContent(document, this.getFileMode())
      webviewPanel.webview.postMessage({
        type: 'loadDocument',
        markup,
        comments,
        filePath: document.uri.fsPath,
      })
    })

    webviewPanel.onDidDispose(() => {
      this.openPanelCount--
      this.updateStatusBar()
      willSaveDisposable.dispose()
      configDisposable.dispose()
      changeDisposable.dispose()
    })
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  private updateStatusBar(): void {
    if (this.openPanelCount > 0) {
      const mode = this.getFileMode()
      this.statusBar.text = `$(edit) MF: ${mode === 'sidecar' ? 'Sidecar' : 'CriticMarkup'}`
      this.statusBar.tooltip = `Markdown Feedback — file mode: ${mode}. Change via Settings → markdownFeedback.fileMode`
      this.statusBar.show()
    } else {
      this.statusBar.hide()
    }
  }

  // ── File content helpers ──────────────────────────────────────────────────

  private getFileMode(): FileMode {
    const cfg = vscode.workspace.getConfiguration('markdownFeedback')
    return cfg.get<FileMode>('fileMode', 'criticmarkup')
  }

  private async loadContent(
    document: vscode.TextDocument,
    fileMode: FileMode
  ): Promise<{ markup: string; comments: Record<string, string> }> {
    if (fileMode === 'sidecar') {
      // Read .criticmark sidecar if it exists
      const sidecar = readSidecar(document.uri.fsPath)
      if (sidecar) {
        return { markup: sidecar.markup ?? '', comments: sidecar.comments ?? {} }
      }
      // No sidecar yet: treat the .md content as the starting document
      return { markup: document.getText(), comments: {} }
    }

    // Mode A: .md IS the CriticMarkup document
    return { markup: document.getText(), comments: {} }
  }

  private async applyEdit(
    document: vscode.TextDocument,
    fileMode: FileMode,
    markup: string,
    comments: Record<string, string>
  ): Promise<void> {
    const edit = new vscode.WorkspaceEdit()
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    )

    if (fileMode === 'sidecar') {
      // Write full state to .criticmark sidecar
      await writeSidecar(document.uri.fsPath, { markup, comments, savedAt: Date.now() })
      // Write clean markdown to the .md TextDocument (marks it dirty)
      edit.replace(document.uri, fullRange, acceptAllChanges(markup))
    } else {
      // Mode A: write CriticMarkup string directly to .md
      edit.replace(document.uri, fullRange, markup)
    }

    await vscode.workspace.applyEdit(edit)
  }

  // ── WebView HTML ──────────────────────────────────────────────────────────

  private getWebviewHtml(): string {
    const mediaPath = path.join(this.context.extensionPath, 'media', 'index.html')

    if (!fs.existsSync(mediaPath)) {
      return `<!DOCTYPE html><html><body>
        <p style="font-family:sans-serif;padding:2rem;color:#c00">
          WebView bundle not found. Run <code>npm run build:vscode:webview</code> first.
        </p>
      </body></html>`
    }

    let html = fs.readFileSync(mediaPath, 'utf-8')

    // Inject a permissive CSP that allows the inline scripts/styles produced
    // by viteSingleFile. This is safe because:
    //  - The bundle is our own trusted code (not user-supplied)
    //  - VS Code WebViews are sandboxed (no fs access, no external network by default)
    const csp = [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "script-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
    ].join('; ')

    html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`)

    return html
  }
}
