# Markdown Feedback

A web-based track-changes editor for markdown. Edit naturally — every deletion, insertion, and substitution is captured automatically as [CriticMarkup](http://criticmarkup.com/spec.php) notation.

Built for the workflow: LLM generates draft → human edits with track changes → changes + annotations exported as portable `.md` → patterns analyzed to improve future drafts.

**Live:** https://markdown-feedback.com

## Status

**Phase 7 in progress** (DOCX import from Google Docs — Phases A–D complete). See [BACKLOG.md](BACKLOG.md) for the full roadmap.

## How It Works

The editor intercepts every edit at the keyboard/input level and transforms it into a tracked change. The document *is* the change log — there is no separate "before" and "after."

| User Action | Result |
|---|---|
| Delete original text | Text stays in document as red strikethrough |
| Type new text | New text appears in green |
| Select original + type replacement | Substitution: strikethrough old + green new, linked |
| Edit within your own insertion | Normal editing (no tracking) |
| Backspace on already-deleted text | Cursor skips over it |
| Tab on a tracked change | Jump to comment input |
| Cmd+Shift+H with selection | Highlight text for standalone comment |

The output is standard CriticMarkup:

```
The team {~~delivered the results~>presented their findings~~}{>>active voice is more direct<<} to the board.
{--This sentence was redundant.--}{>>removed for concision<<}
{++A new concluding thought.++}
```

## Run Locally (Single HTML File)

If you can't access the hosted version — or prefer not to send any traffic to an external site — you can run Markdown Feedback as a single, self-contained HTML file. No server, no install, no network access required.

1. Download `index.html` from the [latest release](https://github.com/dudgeon/markdown-feedback/releases/latest), or build it from source:

```bash
# Requires Node 20+
npm install
npm run build:single    # outputs dist-single/index.html
```

2. Open `dist-single/index.html` in any browser.

That's it. The entire application — editor, track changes, import/export, .docx support — runs from that one file.

### Trust model

Markdown Feedback is a **fully client-side application**. There is no server, no backend, no analytics, and no network requests. Your documents never leave your browser.

- **No data transmission.** The app makes zero network calls. It works offline, from a `file://` URL, or air-gapped.
- **No external dependencies at runtime.** All libraries (React, the editor engine, .docx parser) are bundled into the HTML file. Nothing is fetched from a CDN.
- **No persistent storage beyond your browser.** Session recovery uses `localStorage` (same-origin, never transmitted). Closing the tab or clearing browser data removes it entirely.
- **Fully auditable.** The file is ~730 KB of minified JavaScript and CSS. The source code is MIT-licensed and available in this repository.

This means it's safe to use on corporate networks, behind firewalls, or in environments with strict data handling policies — your content stays on your machine.

## Quick Start (Development)

```bash
# Requires Node 20+
npm install
npm run dev       # http://localhost:5173/
```

## Commands

```bash
npm run dev            # Vite dev server with HMR
npm run build          # TypeScript check + production build
npm run build:single   # Single self-contained HTML file
npm run lint           # ESLint
npm run preview        # Preview production build
```

## Tech Stack

- React 19 + TypeScript (strict)
- TipTap 3 (ProseMirror) — editor framework
- Tailwind CSS 4
- Vite 7
- nanoid — unique IDs for tracked change spans
- JSZip — client-side .docx extraction

## Project Documents

- [BACKLOG.md](BACKLOG.md) — Roadmap and feature backlog
- [docs/prd.md](docs/prd.md) — Full product requirements (intercept architecture)
- [docs/project-context.md](docs/project-context.md) — Decision log and project context
- [docs/docx-import.md](docs/docx-import.md) — DOCX import architecture (Phase 7)
- [docs/vscode-extension.md](docs/vscode-extension.md) — VSCode extension architecture (Phase 9)
- [CHANGELOG.md](CHANGELOG.md) — Release history
- [CLAUDE.md](CLAUDE.md) — AI coding assistant instructions
