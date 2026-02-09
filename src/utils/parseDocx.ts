/**
 * Entry point for .docx import.
 *
 * Takes an ArrayBuffer from a file input, extracts the OOXML XML files
 * using JSZip, parses them with the browser's DOMParser, and runs the
 * OOXML walker to produce a CriticMarkup markdown string.
 */

import { docxToMarkdown } from './docxToMarkdown'

export interface DocxParseResult {
  markup: string
  changeCount: number
  commentCount: number
}

export async function parseDocx(buffer: ArrayBuffer): Promise<DocxParseResult> {
  // Dynamic import so JSZip only loads when the user actually imports a .docx
  const JSZip = (await import('jszip')).default

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error(
      "This doesn't appear to be a .docx file. Please select a Word document."
    )
  }

  // Extract document.xml (required)
  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error(
      'This file appears to be corrupted or is not a standard Word document.'
    )
  }
  const docXmlStr = await docXmlFile.async('string')

  const parser = new DOMParser()
  const documentXml = parser.parseFromString(docXmlStr, 'application/xml')
  if (documentXml.querySelector('parsererror')) {
    throw new Error(
      'There was a problem reading this file. Try re-exporting from Google Docs.'
    )
  }

  // Extract comments.xml (optional — not all docs have comments)
  let commentsXml: Document | null = null
  const commentsFile = zip.file('word/comments.xml')
  if (commentsFile) {
    const commentsStr = await commentsFile.async('string')
    commentsXml = parser.parseFromString(commentsStr, 'application/xml')
    if (commentsXml.querySelector('parsererror')) {
      commentsXml = null // Ignore malformed comments rather than failing
    }
  }

  // Extract numbering.xml (optional — only present if doc has lists)
  let numberingXml: Document | null = null
  const numberingFile = zip.file('word/numbering.xml')
  if (numberingFile) {
    const numberingStr = await numberingFile.async('string')
    numberingXml = parser.parseFromString(numberingStr, 'application/xml')
    if (numberingXml.querySelector('parsererror')) {
      numberingXml = null
    }
  }

  return docxToMarkdown(documentXml, commentsXml, numberingXml)
}
