/**
 * Export utilities for CriticMarkup documents.
 *
 * All functions operate on the serialized CriticMarkup string
 * produced by serializeCriticMarkup().
 */

export interface ExportMetadata {
  editDate: string // ISO datetime
  changesTotal: number
}

/**
 * Wrap a CriticMarkup string with YAML frontmatter.
 */
export function exportCriticMarkup(
  markup: string,
  metadata: ExportMetadata
): string {
  const frontmatter = [
    '---',
    'criticmark:',
    `  edit_date: ${metadata.editDate}`,
    `  changes_total: ${metadata.changesTotal}`,
    '---',
    '',
  ].join('\n')

  return frontmatter + markup + '\n'
}

/**
 * Accept all changes: produce the edited/clean version.
 *
 * - {++text++}      → text  (keep insertions)
 * - {--text--}      → ""    (remove deletions)
 * - {~~old~>new~~}  → new   (keep replacement)
 * - {>>comment<<}   → ""    (strip comments)
 */
export function exportClean(markup: string): string {
  let result = markup
  // Substitutions first (before standalone deletion/insertion patterns)
  result = result.replace(/\{~~[\s\S]+?~>([\s\S]*?)~~\}/g, '$1')
  result = result.replace(/\{--[\s\S]+?--\}/g, '')
  result = result.replace(/\{\+\+([\s\S]+?)\+\+\}/g, '$1')
  result = result.replace(/\{>>[\s\S]+?<<\}/g, '')
  return result
}

/**
 * Reject all changes: produce the original version.
 *
 * - {++text++}      → ""    (remove insertions)
 * - {--text--}      → text  (restore deletions)
 * - {~~old~>new~~}  → old   (keep original)
 * - {>>comment<<}   → ""    (strip comments)
 */
export function exportOriginal(markup: string): string {
  let result = markup
  // Substitutions first
  result = result.replace(/\{~~([\s\S]+?)~>[\s\S]*?~~\}/g, '$1')
  result = result.replace(/\{--([\s\S]+?)--\}/g, '$1')
  result = result.replace(/\{\+\+[\s\S]+?\+\+\}/g, '')
  result = result.replace(/\{>>[\s\S]+?<<\}/g, '')
  return result
}

/**
 * Count CriticMarkup change tokens in a string.
 */
export function countChanges(markup: string): number {
  const tokenRe = /\{~~[\s\S]+?~>[\s\S]*?~~\}|\{--[\s\S]+?--\}|\{\+\+[\s\S]+?\+\+\}/g
  const matches = markup.match(tokenRe)
  return matches ? matches.length : 0
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
