# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CriticMark Editor — a web-based track-changes editor for markdown that intercepts edits in real-time and records them as CriticMarkup notation. Users edit LLM-generated documents; every change (insertion, deletion, substitution) is captured automatically with optional annotations.

Full specification lives in `prd-criticmark-editor-v2.md` and `criticmark-project-context.md` (if present in repo). Currently in Phase 1 spike — testing the TipTap intercept plugin.

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
  - `TrackChangesPlugin` — `appendTransaction`-based approach (currently returns null — superseded by handler approach)
  - `TrackChanges` — Active implementation using `handleKeyDown`, `handleTextInput`, and `handlePaste` to intercept edits directly
- `src/components/Editor.tsx` — TipTap editor setup with sample content
- `src/index.css` — Track changes visual styles (`.tracked-deletion`, `.tracked-insertion`) + TipTap editor styles

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

## Relevant Skills for This Build

- **ProseMirror internals** — marks, schema, transactions, plugins, `appendTransaction`, step mapping
- **TipTap 3 extension API** — `Mark.create`, `Extension.create`, `addProseMirrorPlugins`, `handleKeyDown`/`handleTextInput`/`handlePaste` props
- **DOM contentEditable behavior** — cursor positioning, selection ranges, `beforeinput` events
- **CriticMarkup spec** — http://criticmarkup.com/spec.php
- **Obsidian CriticMarkup plugin** — https://github.com/Fevol/obsidian-criticmarkup (compatibility target)
