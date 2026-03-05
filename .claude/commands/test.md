---
description: Pre-release browser testing suite — validates all core features and known regression areas
allowed-tools: Bash, Read, Glob, Grep, TodoWrite, AskUserQuestion, mcp__claude-in-chrome__tabs_context_mcp, mcp__claude-in-chrome__tabs_create_mcp, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__javascript_tool, mcp__claude-in-chrome__read_console_messages, mcp__claude-in-chrome__read_page, mcp__claude-in-chrome__get_page_text, mcp__claude-in-chrome__gif_creator, mcp__claude-in-chrome__upload_image
---

# Pre-Release Test Suite

Run this before every release to catch regressions. Each section targets a specific area that has broken in the past.

**Important:** The user must type `@browser` in chat to connect Chrome browser tools before this skill can run. If `tabs_context_mcp` fails, remind the user.

## Environment

Prefix all bash commands with:
```
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 20.19.3
```

## Setup

1. Run `npm run build` to catch TypeScript errors (unused vars, type mismatches)
2. Start the dev server (`npm run dev`) if not already running
3. Call `tabs_context_mcp` to connect to Chrome
4. Navigate to `http://localhost:5173/`
5. Clear localStorage via `javascript_tool`: `localStorage.clear()`
6. Reload the page
7. Create a TodoWrite checklist from the test sections below — mark each as you go

## Test 1: Empty State

**Regression:** Recovery modal popping on empty/blank session

- [ ] Fresh load (after clearing localStorage): editor shows placeholder text "Click here to begin writing", no recovery modal
- [ ] Changes panel shows "No changes"
- [ ] Source view (expand it) shows empty or whitespace-only content

## Test 2: Basic Track Changes

**Regression:** Cursor dead zones from per-character deletion spans

- [ ] Click the editor, type "Hello world" → text appears in green (tracked insertion)
- [ ] Source view shows `{++Hello world++}`
- [ ] Changes panel shows "1 change" with type "Inserted"
- [ ] Place cursor in the middle of "Hello", press Backspace twice → two characters deleted, no cursor dead zone
- [ ] Select "world" and type "everyone" → substitution: red strikethrough "world" + green "everyone"
- [ ] Source view shows substitution syntax `{~~world~>everyone~~}`
- [ ] Changes panel shows the substitution entry

## Test 3: Comments — Add, Persist, Reload

**Regression:** Comments lost on reload (stale editor ref serialized empty rawMarkup); comment submit hiding changes from panel

- [ ] With tracked changes visible in the editor, click "+ Comment" on a change in the panel
- [ ] Type a comment, press Enter → comment saves, cursor returns to editor (not stuck in panel)
- [ ] Changes panel still shows all changes (none disappeared)
- [ ] Panel header shows correct count (e.g., "2 changes, 1 comment")
- [ ] Check store state via `javascript_tool`:
  ```js
  const s = window.__docStore.getState();
  JSON.stringify({ rawMarkup: s.rawMarkup.substring(0, 200), commentCount: Object.keys(s.comments).length, editorDestroyed: s.editor?.isDestroyed })
  ```
  - `rawMarkup` contains `{>>comment text<<}`
  - `editorDestroyed` is `false`
- [ ] Check localStorage via `javascript_tool`:
  ```js
  const saved = JSON.parse(localStorage.getItem('markdown-feedback-session'));
  JSON.stringify({ hasMarkup: saved?.markup?.length > 0, hasComment: saved?.markup?.includes('{>>'), savedAt: saved?.savedAt })
  ```
  - `hasMarkup` is true, `hasComment` is true
- [ ] Reload the page → recovery modal appears ("Resume your previous session?")
- [ ] Click "Resume" → editor shows same text with tracked changes AND comments intact
- [ ] Changes panel shows correct change + comment counts

## Test 4: Comment Editing and Deletion

- [ ] Click an existing comment text to enter edit mode → textarea appears with existing text
- [ ] Modify the text, press Enter → comment updates in panel
- [ ] Hover over a comment → delete (×) button appears
- [ ] Click delete → comment removed, panel count updates

## Test 5: Multi-Comment Threads

- [ ] Add a second comment (reply) to a change that already has one comment
- [ ] Both comments appear stacked under the change
- [ ] Panel header shows updated comment count
- [ ] Reload + Resume → both comments survive

## Test 6: Highlights (Standalone Comments)

**Regression:** Tab-to-comment broken (known open issue — document current status)

- [ ] Select text in the editor, press Cmd+Shift+H → text gets yellow highlight
- [ ] Changes panel shows a "Comment" type entry with the highlighted text
- [ ] Comment input auto-focuses for the new highlight
- [ ] Type a comment, press Enter → saves, cursor returns to editor
- [ ] Source view shows `{==highlighted text==}{>>comment<<}`

## Test 7: Track Changes Toggle

- [ ] Click the tracking toggle pill (or Cmd+Shift+T) → pill shows "Direct"
- [ ] Type new text → appears as normal black text (no green insertion mark)
- [ ] Toggle tracking back on → pill shows "Tracking"
- [ ] Type more text → appears in green again

## Test 8: Import — CriticMarkup Paste

- [ ] Click Import → paste the following:
  ```
  This is {--old--}{++new++} text with a {~~substitution~>replacement~~} and a {==highlight==}{>>note<<}.
  ```
- [ ] Click "Load" → editor shows the parsed content with correct styling:
  - "old" in red strikethrough
  - "new" in green
  - "substitution" in red strikethrough, "replacement" in green
  - "highlight" with yellow background
- [ ] Changes panel shows 4 entries (deletion+insertion or substitution, plus highlight)
- [ ] "note" appears as a comment on the highlight

## Test 9: Export

- [ ] Click Export → "CriticMarkup (.md)" → downloads a `.md` file
- [ ] Export → "Clean (accept all)" → file contains only the "accepted" text (no markup)
- [ ] Export → "Original (reject all)" → file contains only the "original" text (no markup)
- [ ] Export → "Copy to clipboard" → clipboard contains CriticMarkup string

## Test 10: Session Recovery Edge Cases

**Regression:** Session resume showing empty editor (stale editor ref)

- [ ] With content in the editor, reload the page
- [ ] Recovery modal shows with relative timestamp
- [ ] Click "Resume" → content restores fully (not empty placeholder)
- [ ] Click "Start Fresh" on a subsequent reload → editor is empty, localStorage cleared

## Test 11: Revert Changes

- [ ] Create a tracked insertion, then click the revert (↩) button on its card → inserted text removed
- [ ] Create a tracked deletion, revert → deleted text restored (no longer struck through)
- [ ] Create a substitution, revert → original text restored, replacement removed

## Test 12: Click-to-Scroll

- [ ] With multiple changes, click a change card in the panel → editor scrolls to that change and selects the text

## Test 13: Font Selector

- [ ] Click "Serif" in the toolbar font toggle → editor text switches to Literata serif font
- [ ] Click "Sans" → editor text switches back to sans-serif
- [ ] Reload → font preference persists

## Test 14: Responsive Layout

- [ ] Resize browser to < 1024px wide → changes panel collapses, toggle button shows in toolbar
- [ ] Click panel toggle → drawer slides in from right with backdrop
- [ ] Click backdrop or press Escape → drawer closes
- [ ] Resize back to >= 1024px → panel reappears inline

## Test 15: Console Errors

- [ ] At the end of testing, run `read_console_messages` with `onlyErrors: true`
- [ ] No unexpected JavaScript errors (React warnings about keys are acceptable)

## Test 16: Build Verification

- [ ] `npm run build` succeeds
- [ ] `npm run build:single` succeeds (produces `dist-single/index.html`)
- [ ] `npm run build:vscode` succeeds
- [ ] `npm run package:vscode` succeeds (produces `extension/markdown-feedback-<version>.vsix`)

## Test 17: Rich Markdown Decorations — Toggle

**New in Phase 10D**

- [ ] Click the "Plain" button in the toolbar → button changes to "Rich" with blue styling
- [ ] Click "Rich" again → toggles back to "Plain"
- [ ] Reload page → decoration preference persists (check `localStorage.getItem('decorationsEnabled')`)

## Test 18: Rich Markdown Decorations — Import with Formatting

- [ ] Turn decorations ON (click "Plain" → "Rich")
- [ ] Click Import → paste the following:
  ```
  ## A Heading

  This is **bold** and *italic* and `code` and ~~struck~~ text.

  - First item
  - Second item

  1. One
  2. Two

  > A blockquote

  ```js
  const x = 1
  ```
  ```
- [ ] Click "Load" → editor shows:
  - "A Heading" rendered as a large heading (not `## A Heading`)
  - "bold" in bold, "italic" in italic, "code" in code style, "struck" in strikethrough
  - Bullet list with bullets (not `- ` prefixes)
  - Numbered list with numbers (not `1. ` prefixes)
  - Blockquote with left border (not `> ` prefix)
  - Code block with dark background
- [ ] Source view shows the original markdown syntax preserved (with `##`, `**`, `*`, etc.)

## Test 19: Rich Markdown Decorations — Track Changes + Formatting

- [ ] With decorations ON, import:
  ```
  This is **bold original** text.
  ```
- [ ] "bold original" appears bold in the editor
- [ ] Select "original" and type "changed" → substitution: "original" in red strikethrough (still bold), "changed" in green
- [ ] Source view shows CriticMarkup wrapping the formatted text
- [ ] Toggle decorations OFF → editor shows raw markdown syntax as literal text
- [ ] Toggle decorations ON → formatting reappears

## Test 20: Rich Markdown Decorations — Round Trip

- [ ] With decorations ON, import a document with mixed formatting and tracked changes
- [ ] Export as CriticMarkup → re-import the exported file → editor state matches original
- [ ] Change count is the same before and after round-trip

## Known Open Issues (Document, Don't Fail)

These are known broken — note their current status but don't block the release:

- **Tab-to-comment:** Tab on a tracked change should focus the comment input in the panel. Currently broken. Note whether it works or not.
- **DOCX import:** .docx file import may report "No tracked changes found." Note current behavior.
- **Plain mode heading syntax:** When decorations are set to "Plain", heading `##` markers are not displayed in the editor — heading levels cannot be changed in Plain mode. This is an accepted defect; headings can be edited in Rich mode or via source export/re-import.

## Reporting

After completing all tests, summarize results:
1. Number of tests passed / failed
2. Any new regressions discovered
3. Status of known open issues
4. Recommendation: release-ready or needs fixes

If any **regression test** fails (Tests 1–5, 10–11), the release should be blocked until fixed.
