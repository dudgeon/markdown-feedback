import Paragraph from '@tiptap/extension-paragraph'

/**
 * Extended Paragraph node that supports a `tableRow` boolean attribute.
 *
 * When `tableRow` is true, the paragraph renders with a `table-row` CSS class
 * for monospace styling and tight margins. The attribute round-trips through
 * HTML via `<p class="table-row">`.
 */
export const TableRowParagraph = Paragraph.extend({
  addAttributes() {
    return {
      tableRow: {
        default: false,
        parseHTML: (element) => element.classList.contains('table-row'),
        renderHTML: (attributes) => {
          if (!attributes.tableRow) return {}
          return { class: 'table-row' }
        },
      },
    }
  },
})
