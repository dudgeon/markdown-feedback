# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Markdown Feedback — a web-based track-changes editor for markdown that intercepts edits in real-time and records them as CriticMarkup notation. Users edit LLM-generated documents; every change (insertion, deletion, substitution) is captured automatically with optional annotations.

Full specification lives in `docs/prd.md` and `docs/project-context.md`. Roadmap and feature backlog: `BACKLOG.md`.

**Live:** https://markdown-feedback.com

**Status:** Phase 9A+B COMPLETE (VSCode extension — CriticMarkup inline + sidecar modes). Next: Phase 8D (Tauri macOS shell). Phase 7E (DOCX polish) partial. See BACKLOG.md for details.

## Commands

```bash
npm run dev            # Start Vite dev server with HMR
npm run build          # TypeScript check + Vite production build
npm run build:single   # Single self-contained HTML file (output: dist-single/index.html)
npm run lint           # ESLint (flat config, TS + React)
npm run preview        # Preview production build locally
```

## Releases

Use the `/release` slash command to create a new release. It handles the full lifecycle:
1. Discovers unreleased commits since the last tag
2. Summarizes changes and suggests a version
3. Creates/updates CHANGELOG.md
4. Builds all artifacts: `npm run build:single` (web app) + `npm run package:vscode` (VSCode extension)
5. Commits, tags, pushes, and creates a GitHub release with **both** `dist-single/index.html` and `extension/markdown-feedback-X.Y.Z.vsix` attached

Release history lives in `CHANGELOG.md`. Each GitHub release has both artifacts attached so users can download either.

### Release artifact registry

This is the canonical list of artifacts that must be attached to every release. Update it whenever a new build target is added to the project — do not mark a phase complete without doing this.

| Artifact | Build command | Output path |
|---|---|---|
| Web app (single-file HTML) | `npm run build:single` | `dist-single/index.html` |
| VSCode extension | `npm run package:vscode` | `extension/markdown-feedback-<version>.vsix` |

## Tech Stack

- **React 19** + TypeScript (strict, Vite scaffold)
- **TipTap 3** (ProseMirror wrapper) — editor framework
- **Tailwind CSS 4** (via `@tailwindcss/vite` plugin)
- **Vite 7** — build tool
- **Zustand** — lightweight state management (document store)
- **nanoid** — unique IDs for tracked change spans
- **JSZip** — client-side .docx extraction (dynamic import, only loaded on .docx import)

## Architecture

### Intercept Model (Non-Negotiable)

This project uses an intercept-based architecture, NOT a diff-based approach. Every edit is intercepted at the keyboard/input level and transformed into a tracked change. The document is the change log.

### Key Files

- `src/extensions/trackChanges.ts` — Core of the system. Contains:
  - `TrackedDeletion` mark — red strikethrough, `contenteditable=false`, non-inclusive
  - `TrackedInsertion` mark — green text, inclusive (extends when typing at edges)
  - `TrackedHighlight` mark — yellow highlight for standalone comments, non-inclusive
  - `TrackChanges` extension — uses `handleKeyDown`, `handleTextInput`, `handlePaste`, and `handleDOMEvents.beforeinput` to intercept edits directly. The `beforeinput` handler catches all deletion `inputType`s for iOS compatibility (where `keydown` fires `key: "Unidentified"` for Backspace/Delete); on desktop, `handleKeyDown` prevents `beforeinput` from firing via `preventDefault()`. Also handles Tab-to-comment (when cursor is on a change), Cmd+Shift+H to create highlights, and Cmd+Shift+T to toggle tracking. Track changes toggle state is a module-level variable (`_trackingEnabled`) — NOT TipTap `addStorage()`, which resets on `useEditor` re-render. `appendTransaction` strips inclusive insertion marks from untracked text when tracking is off.
- `src/utils/serializeCriticMarkup.ts` — Walks ProseMirror doc tree and emits CriticMarkup string. Accepts a `comments` Record to emit `{>>comment<<}` after changes and `{==text==}{>>comment<<}` for highlights. Key design: `pairedWith !== null` distinguishes substitution parts from standalone changes.
- `src/utils/parseCriticMarkup.ts` — Reverse of serializer. `parseCriticMarkup()` tokenizes a CriticMarkup string into typed segments including highlights and comments; `criticMarkupToHTML()` returns `{ html, comments }` — the HTML with tracked-change spans, and a Record mapping change IDs to comment text. `extractCommentsFromSegments()` links comment tokens to their preceding change/highlight.
- `src/utils/exportDocument.ts` — Export functions: `exportCriticMarkup()` (YAML frontmatter + markup), `exportClean()` (accept all changes), `exportOriginal()` (reject all changes), `countChanges()`, `downloadFile()`. Both clean and original exports strip `{==...==}` highlight markers.
- `src/utils/extractChanges.ts` — Walks ProseMirror doc tree and extracts a structured `ChangeEntry[]` list with type (deletion/insertion/substitution/highlight), text, context snippets, positions, and optional comment text. Accepts a `comments` Record to merge into entries.
- `src/stores/documentStore.ts` — Zustand store owning all document state (comments, changes, rawMarkup, trackingEnabled, focusCommentId, recovery state) and actions (handleEditorChange, importDocument, setComment, toggleTracking, etc.). Editor instance stored non-reactively. Persistence via `stores/persistence/` abstraction layer.
- `src/stores/persistence/` — Platform-abstracted persistence. `types.ts` defines `PlatformAdapter` (session save/load/clear + optional file I/O + `capabilities` flags). `web.ts` — localStorage adapter; optional fields are no-ops. `index.ts` — factory with commented stubs for VSCode and Tauri detection. New adapters: `vscode.ts` (Phase 9A), `tauri.ts` (Phase 8D).
- `src/components/Editor.tsx` — Thin layout shell consuming Zustand store. Owns UI-only toggles (sourceExpanded, importOpen, panelOpen, aboutOpen), TipTap `useEditor` setup, debounced values, auto-save effect, and DOM event listeners bridging plugin shortcuts to store actions.
- `src/components/ChangesPanel.tsx` — Right sidebar listing all tracked changes and highlights in document order. Shows change type badge, context snippets with inline highlighting, click-to-scroll, and per-entry comment input (auto-save on blur, Tab/Enter to save and return to editor).
- `src/utils/parseDocx.ts` — Entry point for .docx import. Takes an ArrayBuffer, extracts XML files via JSZip (dynamic import), parses with DOMParser, and calls `docxToMarkdown()`. Extracts `word/document.xml`, `word/comments.xml`, and `word/numbering.xml`.
- `src/utils/docxToMarkdown.ts` — OOXML walker that converts parsed XML DOMs to a CriticMarkup markdown string. Handles tracked changes (`<w:ins>`, `<w:del>` in both orderings), comments, comment-to-change attribution, and list detection via numbering.xml.
- `src/components/ImportModal.tsx` — Tabbed import modal (Paste / .docx File). Paste tab parses CriticMarkup tokens. DOCX tab has file picker, parse status with change/comment counts, and error handling.
- `src/components/ExportMenu.tsx` — Dropdown menu with download options (CriticMarkup, clean, original) and copy to clipboard
- `src/components/SourceView.tsx` — Collapsible panel showing syntax-highlighted CriticMarkup output with copy button
- `src/components/RecoveryModal.tsx` — Session recovery prompt shown on app load when localStorage has saved state. "Resume" restores via import path; "Start Fresh" clears storage.
- `src/components/Toolbar.tsx` — Top toolbar with about icon, title, Import (responsive), Export menu, and changes panel toggle with badge
- `src/components/AboutPanel.tsx` — Left slide-in panel with app description, "Why I built this", GitHub link, and footer
- `src/hooks/useDebouncedValue.ts` — Generic debounce hook for source view updates and auto-save
- `src/index.css` — Track changes visual styles + source view syntax highlighting

### Import Design Decision

Import always parses CriticMarkup tokens — there is no "Start fresh" vs "Resume editing" prompt. If the user pastes a CriticMarkup file, deletions/insertions/substitutions are reconstructed as tracked changes. If they want to treat CriticMarkup content as plain original text, the planned "rebaseline" feature (see BACKLOG.md > Source View Actions) will clear all markup.

### Intercept Behaviors

| User Action | Result |
|---|---|
| Delete original text | Mark as `trackedDeletion` (text stays in doc, red strikethrough) |
| Type new text | Wrap in `trackedInsertion` mark (green text) |
| Select original + type | Substitution: deletion mark on old + insertion mark on new, linked via `pairedWith` |
| Edit within insertion | Normal edit (user refining their own addition) |
| Delete within insertion | Truly removes characters |
| Backspace/Delete on already-deleted text | Cursor skips over the deletion span |
| Tab on a tracked change | Focus comment input in Changes Panel for that change |
| Tab on normal text | Normal behavior (indent/default) |
| Cmd+Shift+H with text selected | Apply highlight mark, focus comment input |
| Cmd+Shift+T | Toggle track changes on/off |
| Tracking OFF + any edit | Normal ProseMirror behavior (no marks applied) |

### CriticMarkup Syntax (Target Output)

```
{++inserted text++}      — Additions
{--removed text--}       — Deletions
{~~old~>new~~}           — Substitutions
{>>comment text<<}       — Comments (immediately after change)
{==highlighted text==}   — Highlights (standalone comment target)
```

## Environment

Node v18 is too old for Vite 7. Use NVM to switch (shell state doesn't persist between commands):
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 20.19.3
```

## Deployment

Pushing to `main` auto-deploys to GitHub Pages via `.github/workflows/deploy.yml`.

The `base` path in `vite.config.ts` is `'/'` because the app is served from `markdown-feedback.com` (custom domain on GitHub Pages). The `public/CNAME` file ensures the custom domain is preserved across deployments. Dev server URL: `http://localhost:5173/`.

## Testing

Always verify changes in the browser, not just with `tsc` or `npm run build`. **Important:** The user must type `@browser` in the chat to connect the Chrome browser tools. Remind them if browser testing is needed and the tools aren't responding.

Use the Chrome browser automation tools (`mcp__claude-in-chrome__*`) to:
1. Navigate to http://localhost:5173/
2. Make edits (click, type, select+delete, select+type)
3. Screenshot to verify visual styling
4. `javascript_tool` to inspect DOM structure
5. `read_console_messages` to check for JS errors

Run `npm run build` (not just `tsc --noEmit`) to catch all TypeScript errors including unused variables.

### Parser and Import Testing

When writing or modifying parsers/importers, always test with **real-world input**, not just idealized samples:

1. **Use `npx tsx -e`** to run quick inline tests against the parser with varied inputs before committing
2. **Test round-trip**: export → re-import → verify the editor state matches. This catches frontmatter handling, encoding issues, and token fidelity problems.
3. **Test with messy markdown**: single newlines between blocks, no trailing newline, mixed heading levels, lists immediately after headings, inline code containing CriticMarkup-like syntax
4. **Test with content you didn't write**: paste from a real doc, a Claude conversation, or a README — not just the sample content you already know works

Phase 3 shipped with two bugs (single-newline block separation dropping content, YAML frontmatter not stripped on re-import) that were caught on first real-world use. Both were knowable from the code — the failure was testing only the happy path with idealized input.

### Tailwind CSS Resets

Tailwind's preflight CSS strips browser defaults including `list-style-type`, `margin`, and `padding` on many elements. When styling TipTap editor content under `.tiptap`, explicitly restore any defaults that Tailwind removes (e.g., `list-style-type: disc` for `<ul>`, `list-style-type: decimal` for `<ol>`). Don't assume that setting `padding-left` alone is sufficient for list rendering.

## File Organization

### Repository Layout

```
README.md                  # Project overview (public-facing)
CLAUDE.md                  # AI coding assistant instructions
BACKLOG.md                 # Roadmap + feature backlog
CHANGELOG.md               # Release history
vite.config.ts             # Standard Vite config (GitHub Pages build)
vite.config.singlefile.ts  # Single-file HTML build config
docs/                      # Specification & design documents
  prd.md                   # Product requirements document
  project-context.md       # Decision log & project context
  about-panel.md           # About panel content spec
  docx-import.md           # DOCX import architecture (Phase 7)
  vscode-extension.md      # VSCode extension architecture (Phase 9)
src/                       # Application source code
  components/              # React components
  extensions/              # TipTap/ProseMirror extensions
  hooks/                   # Custom React hooks
  utils/                   # Pure utility functions
  stores/persistence/      # Platform adapter (web.ts, vscode.ts Phase 9A, tauri.ts Phase 8D)
extension/                 # VSCode extension host (Phase 9A — not yet created)
  package.json             # VS Code manifest (contributes.customEditors)
  src/extension.ts         # Extension entry point
  src/editorProvider.ts    # CustomTextEditorProvider
.claude/commands/          # Custom slash commands
  release.md               # /release — changelog, tag, build, publish
.github/workflows/         # CI/CD (GitHub Pages deployment)
```

### Naming Conventions

- **Root-level project files:** UPPERCASE with `.md` extension (`README.md`, `CLAUDE.md`, `BACKLOG.md`)
- **Docs folder:** lowercase, hyphen-separated, no project-name prefix (`prd.md` not `criticmark-prd-v2.md`)
- **Source files:** camelCase for `.ts`/`.tsx` files, matching the default export name
- **No version numbers in filenames.** Version history lives in git. Document status (if needed) goes in the document header, not the filename.
- **No redundant prefixes.** Don't prefix filenames with the project name.

### When Adding New Documents

- Specs, designs, and research go in `docs/`
- Update the "Project Documents" section in `README.md` when adding a new doc
- Keep `BACKLOG.md` as the single source of truth for what's planned, in progress, and done

## Rules

### Phase Completion Requires Process Audit

"Done" means the feature works **and** all downstream processes reflect the new reality. Before marking any phase or significant feature complete, ask:

> "What existing processes, docs, or config assume the old project structure — and are now stale?"

Check each category:
- **Release process** (`CLAUDE.md` artifact registry + `.claude/commands/release.md`) — new build artifact? new output path? update both.
- **CI/CD** (`.github/workflows/`) — new build step, new env var, new test suite? update workflows.
- **README** — new install step, new command, new download artifact? update the user-facing docs.
- **CLAUDE.md Commands section** — new `npm run` script added? add it to the commands table.
- **About panel** (`src/components/AboutPanel.tsx`) — new keyboard shortcut or user-facing feature? update the in-app reference.
- **Spec docs** (`docs/`) — does the spec describe the old architecture? note what changed.

This audit is not optional. A phase that adds a build artifact but doesn't update the release process is not complete — it has deferred a failure to the next release.

### No Destructive Scaffolding

Never run scaffold commands (`npm create`, `npx create-*`, `vite create`, etc.) that overwrite or delete existing files in the repo. Scaffolding tools assume an empty directory and will silently destroy project files (docs, config, source) without warning.

If a scaffold is needed:
1. Run it in a temporary directory outside the repo
2. Copy only the needed files into the project
3. Verify no existing files were lost with `git status` before proceeding

### Preserve Specification Documents

`docs/prd.md` and `docs/project-context.md` are primary project artifacts. Never delete, overwrite, or move them without explicit user approval.

### Keep About Panel Current

When adding or changing user-facing keyboard shortcuts, features, or workflows, update the "Keyboard Shortcuts" section in the About panel (`src/components/AboutPanel.tsx` or equivalent) to reflect the change. The About panel is the user's reference for how to use the app.

### Verify All URLs

Every URL written into README, docs, or code must be verified before committing. Run `gh api`, `curl`, or another check to confirm the resource exists. Never guess GitHub usernames — always check `git remote get-url origin`.

## VSCode Extension (Phase 9)

Full spec: `docs/vscode-extension.md`. Key points for implementation:

- **Extension host** (`extension/src/`) — Node.js TypeScript. Registers `CustomTextEditorProvider` for `.md` with `priority: "option"`. Reads/writes VS Code `TextDocument`. Bridges file I/O to WebView via `postMessage`.
- **WebView** — hosts existing Vite React bundle (`dist-vscode/`). Identical to web app; only the platform adapter changes.
- **VSCode adapter** (`src/stores/persistence/vscode.ts`) — uses `acquireVsCodeApi()`. `load()` returns a Promise that resolves when `loadDocument` arrives from extension host. `save()` posts `documentChanged`. No localStorage used.
- **Message protocol:** `ready` → `platformCapabilities` + `loadDocument` → `documentChanged` (debounced) ← `saveRequested`.
- **File mode A (default):** `.md` file = CriticMarkup string. **File mode B (Phase 9B):** `.md` = clean markdown, `.criticmark` JSON sidecar = `{ markup, comments, savedAt }`.
- **`retainContextWhenHidden: true`** — keep WebView alive when tab is hidden (TipTap is expensive to re-init).
- **Keyboard conflict:** `Cmd+Shift+T` is intercepted by VS Code (reopen closed tab). Track changes toggle shortcut needs remapping for VSCode target — audit during 9A.
- **Build:** `vite.config.vscode.ts` → `dist-vscode/` (base `'./'`). Extension host: esbuild → `extension/dist/`. Package: `vsce package` → `.vsix`.

## Relevant Skills for This Build

- **ProseMirror internals** — marks, schema, transactions, plugins, step mapping
- **TipTap extension API** — `Mark.create`, `Extension.create`, `addProseMirrorPlugins`, `handleKeyDown`/`handleTextInput`/`handlePaste` props
- **DOM contentEditable behavior** — cursor positioning, selection ranges, `beforeinput` events
- **CriticMarkup spec** — http://criticmarkup.com/spec.php
- **Obsidian CriticMarkup plugin** — https://github.com/Fevol/obsidian-criticmarkup (compatibility target)
- **VS Code extension API** — `CustomTextEditorProvider`, `WebviewPanel`, `TextDocument`, `WorkspaceEdit`, `postMessage`
