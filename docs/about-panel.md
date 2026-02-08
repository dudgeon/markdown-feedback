# About Panel — Feature Spec

**Status:** Draft
**Phase:** Standalone (no dependencies on Phase 5+)
**Scope:** Small — one new component, minor layout change

---

## Overview

A left slide-in panel containing meta content about the app: what it does, why it exists, and who made it. Hidden by default, toggled via a discrete icon button near the app title.

---

## Trigger

- Small info/about icon button positioned to the left of the "Markdown Feedback" title in the header
- Icon: a simple `i` info circle or similar — understated, not attention-grabbing
- Click toggles the panel open/closed
- No tooltip required (the icon is self-explanatory), but one saying "About" is fine

## Panel Behavior

- **Position:** Left side of the viewport, slides in from the left edge
- **Default state:** Hidden (closed)
- **Animation:** Smooth slide-in/out transition (CSS transform, ~200–300ms)
- **Overlay vs push:** Overlay — the panel slides over the editor content, does not push it right. This keeps the editor layout stable and avoids reflowing the changes panel.
- **Width:** Fixed, narrow — around 320–360px. Enough for comfortable reading of the paragraph content without feeling like a full sidebar.
- **Height:** Full viewport height (or content height if shorter), with scroll if content ever overflows
- **Backdrop:** Optional subtle backdrop/scrim behind the panel to indicate it's an overlay. Clicking the backdrop closes the panel.
- **Close:** Clicking the icon again, clicking the backdrop, or pressing Escape

## Content

All content is static (no dynamic data). The panel contains, in order:

### 1. App Description

> Markdown Feedback helps you make, track, and add context to changes in markdown using AI-friendly, [CriticMarkup](https://fletcher.github.io/MultiMarkdown-6/syntax/critic.html) native formatting.

- The word "CriticMarkup" is a link to the MultiMarkdown CriticMarkup syntax docs
- Body text size, normal weight

### 2. Section Header: "WHY I BUILT THIS"

- Small text, all caps, letter-spaced — a subtle section divider, not a loud heading
- Muted color (gray-500 or similar)

### 3. Why Content

> As a manager of people and robots, providing context on changes to writing style is essential for continual learning and improved future output quality.
>
> As you build your own Claude Skills and other context documents, annotated examples of your changes to others' text is as powerful as high quality examples of your own writing.
>
> Markdown Feedback was designed to help you generate those annotated examples in a simple, lightweight way.

- Three paragraphs, normal body text
- No special formatting beyond paragraph spacing

### 4. GitHub Link

- Link to the repository: `https://github.com/dudgeon/markdown-feedback`
- Could be a simple text link, a small GitHub icon + link, or both
- Opens in new tab (`target="_blank"`)

### 5. Footer

> Made by Geoff and Claude in 2026.

- Small text, muted color
- Positioned at the bottom of the panel content (not fixed to viewport bottom — just last in the content flow)

## Visual Design

- **Background:** White or very light gray, consistent with the app's existing card/panel aesthetic
- **Typography:** Matches the app — no custom fonts or sizes beyond what's described above
- **Padding:** Generous internal padding (p-6 or similar) — the content is short, give it room to breathe
- **Border:** Right border or subtle shadow to separate from the editor content beneath

## Implementation Notes

- New component: `src/components/AboutPanel.tsx`
- The toggle icon goes in `Editor.tsx` next to the `<h1>` title
- Panel renders at the app root level (inside the main container but positioned fixed/absolute to the viewport left edge)
- No state persistence needed — panel always starts closed on page load
- Content is hardcoded in the component (no external data source)
- The CriticMarkup link is the only interactive element inside the panel

## Out of Scope

- Keyboard shortcut to open the panel
- Version number or changelog
- Settings or preferences in the panel
- Analytics or tracking
