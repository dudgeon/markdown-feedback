import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

export interface SidecarData {
  markup: string
  comments: Record<string, string>
  savedAt: number
}

export function getSidecarPath(mdPath: string): string {
  return path.join(path.dirname(mdPath), path.basename(mdPath, '.md') + '.criticmark')
}

export function readSidecar(mdPath: string): SidecarData | null {
  const p = getSidecarPath(mdPath)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as SidecarData
  } catch {
    return null
  }
}

export async function writeSidecar(mdPath: string, data: SidecarData): Promise<void> {
  const p = getSidecarPath(mdPath)
  const json = JSON.stringify(data, null, 2)
  await vscode.workspace.fs.writeFile(vscode.Uri.file(p), Buffer.from(json, 'utf-8'))
}

export async function deleteSidecar(mdPath: string): Promise<boolean> {
  const p = getSidecarPath(mdPath)
  if (!fs.existsSync(p)) return false
  await vscode.workspace.fs.delete(vscode.Uri.file(p))
  return true
}

/**
 * Accept all CriticMarkup changes — produce clean markdown.
 *
 * Mirrors exportClean() in src/utils/exportDocument.ts.
 * Duplicated here to keep the extension host self-contained
 * (avoids pulling browser-only code into the Node.js bundle).
 *
 * - {~~old~>new~~}  → new  (keep replacement)
 * - {--text--}      → ""   (remove deletions)
 * - {++text++}      → text (keep insertions)
 * - {==text==}      → text (strip highlight markers)
 * - {>>comment<<}   → ""   (strip comments)
 */
export function acceptAllChanges(markup: string): string {
  let result = markup
  result = result.replace(/\{~~[\s\S]+?~>([\s\S]*?)~~\}/g, '$1')
  result = result.replace(/\{--([\s\S]+?)--\}/g, '')
  result = result.replace(/\{\+\+([\s\S]+?)\+\+\}/g, '$1')
  result = result.replace(/\{==([\s\S]+?)==\}/g, '$1')
  result = result.replace(/\{>>[\s\S]+?<<\}/g, '')
  return result
}
