# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Markdown Feedback — a web-based track-changes editor for markdown that intercepts edits in real-time and records them as CriticMarkup notation. Users edit LLM-generated documents; every change (insertion, deletion, substitution) is captured automatically with optional annotations.

Full specification lives in `docs/prd.md` and `docs/project-context.md`. Roadmap and feature backlog: `BACKLOG.md`.

**Live:** https://dudgeon.github.io/markdown-feedback/

**Status:** Phase 3 COMPLETE (import/export). Next: Phase 4 (changes panel).

## Commands

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint (flat config, TS + React)
npm run preview  # Preview production build locally
```

## Tech Stack

- **React 19** + TypeScript (strict, Vite scaffold)
- **TipTap 3** (ProseMirror wrapper) — editor framework
- **Tailwind CSS 4** (via `@tailwindcss/vite` plugin)
- **Vite 7** — build tool
- **nanoid** — unique IDs for tracked change spans

## Architecture

### Intercept Model (Non-Negotiable)

This project uses an intercept-based architecture, NOT a diff-based approach. Every edit is intercepted at the keyboard/input level and transformed into a tracked change. The document is the change log.

### Key Files

- `src/extensions/trackChanges.ts` — Core of the system. Contains:
  - `TrackedDeletion` mark — red strikethrough, `contenteditable=false`, non-inclusive
  - `TrackedInsertion` mark — green text, inclusive (extends when typing at edges)
  - `TrackChanges` extension — uses `handleKeyDown`, `handleTextInput`, and `handlePaste` to intercept edits directly (NOT `appendTransaction` — input handlers proved simpler and more reliable)
- `src/utils/serializeCriticMarkup.ts` — Walks ProseMirror doc tree and emits CriticMarkup string. Key design: `pairedWith !== null` distinguishes substitution parts from standalone changes. Standalone deletions each get unique nanoid IDs (merge by adjacency, not ID). Substitution deletions share the same `id`/`pairedWith` pair.
- `src/utils/parseCriticMarkup.ts` — Reverse of serializer. `parseCriticMarkup()` tokenizes a CriticMarkup string into typed segments; `criticMarkupToHTML()` converts those segments into TipTap-compatible HTML with tracked-change spans. Used for both paste import and initial sample content loading.
- `src/utils/exportDocument.ts` — Export functions: `exportCriticMarkup()` (YAML frontmatter + markup), `exportClean()` (accept all changes), `exportOriginal()` (reject all changes), `countChanges()`, `downloadFile()`.
- `src/components/Editor.tsx` — TipTap editor setup with toolbar (Import + Export), serialization wiring, and source view
- `src/components/ImportModal.tsx` — Paste import modal. Content is always parsed for CriticMarkup tokens (no "Start fresh" vs "Resume editing" prompt — the planned rebaseline feature handles clearing markup).
- `src/components/ExportMenu.tsx` — Dropdown menu with download options (CriticMarkup, clean, original) and copy to clipboard
- `src/components/SourceView.tsx` — Collapsible panel showing syntax-highlighted CriticMarkup output with copy button
- `src/hooks/useDebouncedValue.ts` — Generic debounce hook for source view updates
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

### CriticMarkup Syntax (Target Output)

```
{++inserted text++}      — Additions
{--removed text--}       — Deletions
{~~old~>new~~}           — Substitutions
{>>comment text<<}       — Comments (immediately after change)
```

## Environment

Node v18 is too old for Vite 7. Use NVM to switch (shell state doesn't persist between commands):
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" && nvm use 20.19.3
```

## Deployment

Pushing to `main` auto-deploys to GitHub Pages via `.github/workflows/deploy.yml`.

The `base` path in `vite.config.ts` **must** match the repo name (`/markdown-feedback/`). This affects:
- Production asset paths (CSS, JS bundles)
- Dev server URL: `http://localhost:5173/markdown-feedback/` (not just `/`)

If the repo is ever renamed, update `base` in `vite.config.ts` to match.

## Testing

Always verify changes in the browser, not just with `tsc` or `npm run build`. Use the Chrome browser automation tools (`mcp__claude-in-chrome__*`) to:
1. Navigate to http://localhost:5173/markdown-feedback/
2. Make edits (click, type, select+delete, select+type)
3. Screenshot to verify visual styling
4. `javascript_tool` to inspect DOM structure
5. `read_console_messages` to check for JS errors

Run `npm run build` (not just `tsc --noEmit`) to catch all TypeScript errors including unused variables.

## File Organization

### Repository Layout

```
README.md                  # Project overview (public-facing)
CLAUDE.md                  # AI coding assistant instructions
BACKLOG.md                 # Roadmap + feature backlog
docs/                      # Specification & design documents
  prd.md                   # Product requirements document
  project-context.md       # Decision log & project context
src/                       # Application source code
  components/              # React components
  extensions/              # TipTap/ProseMirror extensions
  hooks/                   # Custom React hooks
  utils/                   # Pure utility functions
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

### No Destructive Scaffolding

Never run scaffold commands (`npm create`, `npx create-*`, `vite create`, etc.) that overwrite or delete existing files in the repo. Scaffolding tools assume an empty directory and will silently destroy project files (docs, config, source) without warning.

If a scaffold is needed:
1. Run it in a temporary directory outside the repo
2. Copy only the needed files into the project
3. Verify no existing files were lost with `git status` before proceeding

### Preserve Specification Documents

`docs/prd.md` and `docs/project-context.md` are primary project artifacts. Never delete, overwrite, or move them without explicit user approval.

## Relevant Skills for This Build

- **ProseMirror internals** — marks, schema, transactions, plugins, step mapping
- **TipTap extension API** — `Mark.create`, `Extension.create`, `addProseMirrorPlugins`, `handleKeyDown`/`handleTextInput`/`handlePaste` props
- **DOM contentEditable behavior** — cursor positioning, selection ranges, `beforeinput` events
- **CriticMarkup spec** — http://criticmarkup.com/spec.php
- **Obsidian CriticMarkup plugin** — https://github.com/Fevol/obsidian-criticmarkup (compatibility target)
