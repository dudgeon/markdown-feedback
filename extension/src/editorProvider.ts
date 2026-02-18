import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

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
 * File mode B (sidecar — Phase 9B):
 *   .md = clean markdown. .criticmark JSON sidecar = { markup, comments }.
 */
export class MarkdownFeedbackEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    const fileMode = this.getFileMode()

    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    }

    webviewPanel.webview.html = this.getWebviewHtml()

    // Pending resolve for the onWillSaveTextDocument pre-save hook
    let pendingSaveResolve: ((markup: string) => void) | null = null

    // ── Message handler (WebView → Host) ────────────────────────────────────
    webviewPanel.webview.onDidReceiveMessage(async (msg: WebViewMessage) => {
      switch (msg.type) {
        case 'ready': {
          // WebView is loaded — send platform info then file content
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
            // This documentChanged is the response to a saveRequested — resolve
            // the pre-save hook with fresh content
            pendingSaveResolve(markup)
            pendingSaveResolve = null
          } else {
            // Normal debounced auto-save: update the TextDocument (marks dirty)
            await this.applyEdit(document, fileMode, markup, comments)
          }
          break
        }
      }
    })

    // ── Pre-save hook: flush latest WebView state before VS Code writes disk ─
    const willSaveDisposable = vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return

      e.waitUntil(
        new Promise<vscode.TextEdit[]>((resolve) => {
          pendingSaveResolve = (markup) => {
            const fullRange = new vscode.Range(
              document.positionAt(0),
              document.positionAt(document.getText().length)
            )
            resolve([vscode.TextEdit.replace(fullRange, markup)])
          }

          webviewPanel.webview.postMessage({ type: 'saveRequested' })

          // Timeout: if WebView doesn't respond in time, fall through with
          // whatever is already in the TextDocument
          setTimeout(() => {
            if (pendingSaveResolve) {
              pendingSaveResolve = null
              resolve([])
            }
          }, 1500)
        })
      )
    })

    // ── External file change: reload WebView content ─────────────────────────
    const changeDisposable = vscode.workspace.onDidChangeTextDocument(async (e) => {
      // Only react to changes made outside our WebView (e.g. git checkout)
      if (e.document.uri.toString() !== document.uri.toString()) return
      if (e.reason === vscode.TextDocumentChangeReason.Undo ||
          e.reason === vscode.TextDocumentChangeReason.Redo) return

      const { markup, comments } = await this.loadContent(document, fileMode)
      webviewPanel.webview.postMessage({ type: 'loadDocument', markup, comments, filePath: document.uri.fsPath })
    })

    webviewPanel.onDidDispose(() => {
      willSaveDisposable.dispose()
      changeDisposable.dispose()
    })
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
      // Phase 9B: read .criticmark sidecar if it exists
      const sidecarPath = this.getSidecarPath(document.uri.fsPath)
      if (fs.existsSync(sidecarPath)) {
        try {
          const raw = fs.readFileSync(sidecarPath, 'utf-8')
          const parsed = JSON.parse(raw) as { markup: string; comments: Record<string, string> }
          return { markup: parsed.markup ?? '', comments: parsed.comments ?? {} }
        } catch {
          // Corrupted sidecar: fall through to treating .md as original content
        }
      }
      // No sidecar: treat the .md file as the original document (no tracked changes)
      return { markup: document.getText(), comments: {} }
    }

    // Mode A (default): .md IS the CriticMarkup document
    return { markup: document.getText(), comments: {} }
  }

  private async applyEdit(
    document: vscode.TextDocument,
    fileMode: FileMode,
    markup: string,
    comments: Record<string, string>
  ): Promise<void> {
    if (fileMode === 'sidecar') {
      // Phase 9B: derive clean markdown for .md, write markup to .criticmark
      // For now, write the full markup to both until exportClean() is wired up
      const sidecarPath = this.getSidecarPath(document.uri.fsPath)
      const sidecar = JSON.stringify({ markup, comments, savedAt: Date.now() }, null, 2)
      fs.writeFileSync(sidecarPath, sidecar, 'utf-8')
      // TODO Phase 9B: write exportClean(markup) to the .md TextDocument instead
      return
    }

    // Mode A: replace the entire TextDocument with the CriticMarkup string
    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length)
      ),
      markup
    )
    await vscode.workspace.applyEdit(edit)
  }

  private getSidecarPath(mdPath: string): string {
    const dir = path.dirname(mdPath)
    const base = path.basename(mdPath, '.md')
    return path.join(dir, `${base}.criticmark`)
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
