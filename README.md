# Markdown Feedback

A web-based track-changes editor for markdown. Edit naturally — every deletion, insertion, and substitution is captured automatically as [CriticMarkup](http://criticmarkup.com/spec.php) notation.

Built for the workflow: LLM generates draft → human edits with track changes → changes + annotations exported as portable `.md` → patterns analyzed to improve future drafts.

**Live:** https://dudgeon.github.io/markdown-feedback/

## Status

**Phase 3 complete** (import/export). Phase 4 (changes panel) is next. See [BACKLOG.md](BACKLOG.md) for the full roadmap.

## How It Works

The editor intercepts every edit at the keyboard/input level and transforms it into a tracked change. The document *is* the change log — there is no separate "before" and "after."

| User Action | Result |
|---|---|
| Delete original text | Text stays in document as red strikethrough |
| Type new text | New text appears in green |
| Select original + type replacement | Substitution: strikethrough old + green new, linked |
| Edit within your own insertion | Normal editing (no tracking) |
| Backspace on already-deleted text | Cursor skips over it |

The output is standard CriticMarkup:

```
The team {~~delivered the results~>presented their findings~~}{>>active voice is more direct<<} to the board.
{--This sentence was redundant.--}{>>removed for concision<<}
{++A new concluding thought.++}
```

## Quick Start

```bash
# Requires Node 20+
npm install
npm run dev       # http://localhost:5173/
```

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # TypeScript check + production build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Tech Stack

- React 19 + TypeScript (strict)
- TipTap 3 (ProseMirror) — editor framework
- Tailwind CSS 4
- Vite 7
- nanoid — unique IDs for tracked change spans

## Project Documents

- [BACKLOG.md](BACKLOG.md) — Roadmap and feature backlog
- [docs/prd.md](docs/prd.md) — Full product requirements (intercept architecture)
- [docs/project-context.md](docs/project-context.md) — Decision log and project context
- [CLAUDE.md](CLAUDE.md) — AI coding assistant instructions
