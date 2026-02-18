# Changelog

## [v1.1.2] — 2026-02-18

### Fixes

- DOCX import: author name now appears in comment text as `Author: note` (plain text, no special badge)
- DOCX import: comment replies (threads) are now concatenated under the main comment so the full thread is visible
- DOCX import: pre-pass collects referenced comment IDs to reliably distinguish main comments from replies

## [v1.1.1] — 2026-02-18

### Fixes

- DOCX import: change count in the preview modal now reflects actual CriticMarkup tokens emitted, fixing a false "no tracked changes found" message
- DOCX import: author attribution surfaced from `w:author` on `<w:ins>`/`<w:del>` elements; each tracked change gets a `[from: Author]` prefix in its comment token
- Changes panel: author badge displayed as non-editable label; comment textarea shows only the user-editable note portion

## [v1.1.0] — 2026-02-18

### Features

- Zustand store extraction: all document state centralized in `documentStore.ts` (97416f7)
- Track changes toggle (Cmd+Shift+T) — pause recording without leaving the editor (97416f7)
- Platform adapter hardening: web/VSCode/Tauri adapters behind a clean `PlatformAdapter` interface (e16238f)
- VSCode Custom Editor extension scaffold: open `.md` files inside VS Code with the full editor UI (679fccf)
- Hide changes panel by default on small viewports for better mobile experience (a03ff3e)

### Infrastructure

- VS Code extension dev launch config (`.vscode/launch.json`) (5160052)
- VSCode extension setup docs added to README and spec (9806458)
- Phase 9A marked complete in backlog; extension package-lock added (fdabbd5)
- Desktop app spec and Phase 8 roadmap added to docs (b2b2944)
- Repo layout, release process, and URL verification rules documented in CLAUDE.md (ecd4377)
- README updated with download link pointing to v1.0.0 release (b52e7ff)

## [v1.0.0] — 2026-02-12

First release. A fully client-side track-changes editor for markdown, with CriticMarkup output.

### Features

- Intercept-based track changes: insertions, deletions, and substitutions captured at the keyboard level (46f94ef, 78006e5)
- CriticMarkup serialization with real-time source view (32e981f)
- CriticMarkup import/export with YAML frontmatter (2dc1a36)
- Changes panel with context snippets, click-to-scroll, and per-change comment inputs (3b56076)
- Annotation system: edit comments on any tracked change, standalone highlights via Cmd+Shift+H (78006e5)
- Responsive two-column layout with mobile drawer (ff922fa)
- About panel with project description and privacy/trust statement (ff922fa, 67244fc)
- Session persistence: auto-save to localStorage with recovery prompt on reload (c097cf7)
- DOCX import from Google Docs with tracked changes and comments (3cac3c0)
- Single-file HTML build for offline/firewall-friendly use (dc5aa00)

### Fixes

- Deletion span cursor dead zones caused by adjacent contenteditable=false spans (3b56076)
- Parser bugs: single-newline block separation, YAML frontmatter not stripped on re-import (f4c204e)
- Changes panel overflow on long entries (62de51d)

### Infrastructure

- GitHub Pages deployment with custom domain markdown-feedback.com (3cac3c0)
- HTTPS enforcement via meta redirect (62de51d)
- Vite 7 + React 19 + TipTap 3 + Tailwind CSS 4 scaffold (46f94ef)
