import * as vscode from 'vscode'
import { MarkdownFeedbackEditorProvider } from './editorProvider'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'markdownFeedback.editor',
      new MarkdownFeedbackEditorProvider(context),
      {
        // Keep the WebView alive when switching tabs — avoids re-initializing
        // the TipTap editor on every tab switch (expensive + loses state)
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  )
}

export function deactivate() {}
