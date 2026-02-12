# Changelog

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
