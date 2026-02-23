# Markdown Feedback — iOS App Specification

**Status:** Research complete, blocked on Phase 8D (Tauri macOS shell). `beforeinput` handler is implemented.
**Author:** Geoff + Claude
**Date:** 2026-02-22
**Framework:** Tauri 2 (shared `src-tauri/` with macOS target)
**Targets:** iPhone (primary), iPad (secondary)

---

## 1. Motivation

Markdown Feedback is a capture mechanism for a writing-style feedback loop: LLM generates a draft, the human edits it, every change is recorded as CriticMarkup. The editing happens in focused sessions — often during commutes, in meetings, or between tasks. These moments happen on a phone, not at a desk.

The web app works in mobile Safari but is not optimized for touch. The Changes Panel is a slide-over drawer. There are no touch affordances for commenting, no keyboard toolbar for track-changes actions, and the iOS virtual keyboard doesn't reliably fire the `keydown` events the intercept layer depends on. An iOS app fills these gaps:

| Capability | Web (Mobile Safari) | iOS App |
|---|---|---|
| Deletion tracking (virtual keyboard) | Broken — `keydown` unreliable for Backspace/Delete | Works — `beforeinput` handler intercepts correctly |
| Keyboard shortcuts (Cmd+Shift+T, Tab, etc.) | Not available | Custom keyboard toolbar with action buttons |
| Files app integration | Not possible | Open/save `.md` files via iOS document picker |
| Share Sheet (receive) | Not possible | Receive shared text/files from other apps |
| Share Sheet (send) | Limited (`navigator.share`) | Native share sheet for CriticMarkup export |
| Offline editing | Requires prior visit + cache | Always available |
| Keyboard avoidance | Browser manages (poorly) | Custom scroll management keeps caret visible |
| App Store distribution | Not possible | TestFlight + App Store |
| Native feel (safe areas, haptics) | Approximated with CSS | First-class iOS citizen |

### Why now

The iOS app depends on two prerequisites that are already specced but not yet built:

1. **Phase 8D (Tauri macOS shell)** — establishes the `src-tauri/` project structure, Rust toolchain, and Tauri configuration. iOS is an additional target within the same project, not a separate codebase.
2. **`beforeinput` handler** — the critical fix for iOS virtual keyboard deletion tracking. This is additive to the existing `handleKeyDown` logic in `trackChanges.ts` and can be implemented independently.

Once both are in place, the iOS app is an incremental extension — not a new project.

---

## 2. Prerequisites & Dependencies

### Hard prerequisites (must be completed first)

| Prerequisite | Why | Status |
|---|---|---|
| Phase 8D — Tauri macOS shell | Creates `src-tauri/`, validates WKWebView compatibility, establishes Tauri build pipeline | Not started |
| `beforeinput` handler in `trackChanges.ts` | iOS virtual keyboards don't fire `keydown` for Backspace/Delete; `beforeinput` with `deleteContentBackward` / `deleteContentForward` is the iOS-correct interception path | **Complete** — handles all deletion inputTypes with 50ms timestamp guard against double-processing |

### Soft prerequisites (should be done first, but not blocking)

| Prerequisite | Why | Status |
|---|---|---|
| Safari browser testing | WKWebView = Safari's engine; any Safari bugs will also appear in the iOS app. Open `markdown-feedback.com` in Safari on iPhone/iPad and do a full editing session before writing iOS-specific code. | Not done |
| Responsive Design Tier 2 (touch-friendly) | 44x44px tap targets, larger import modal, touch-optimized change cards. These CSS changes benefit both the web app on mobile and the iOS target. | Not started (specced in `BACKLOG.md`) |

### Toolchain

| Requirement | Details |
|---|---|
| macOS | Required (iOS development is macOS-only) |
| Xcode | Full app (not just Command Line Tools). Version supporting target iOS SDK. |
| Rust iOS targets | `rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim` |
| CocoaPods | `brew install cocoapods` |
| Apple Developer Program | $99/year — required for device testing and App Store distribution |
| Minimum iOS deployment target | iOS 16.0 (required for paste permission controls; safe area CSS is well-supported) |

---

## 3. Architecture

### 3.1 Shared Tauri Project

The iOS app is not a separate project. It shares the same `src-tauri/` directory as the macOS app (Phase 8D). Tauri 2 supports multiple targets from a single project:

```
markdown-feedback/
  src/                          # React app (UNCHANGED)
  src-tauri/                    # Shared Tauri shell (created in Phase 8D)
    Cargo.toml
    tauri.conf.json             # Base configuration
    tauri.ios.conf.json         # iOS-specific overrides (merged)
    Info.plist                  # Base plist
    Info.ios.plist              # iOS-specific plist overrides
    capabilities/
      default.json              # Permissions
    icons/                      # Generated from source image
    src/
      main.rs                   # Desktop entry point
      lib.rs                    # Mobile entry point (tauri::mobile_entry_point)
    gen/                        # GENERATED by `tauri ios init`
      apple/                    # Xcode project (do not manually edit)
  vite.config.ts                # Web build (unchanged)
  vite.config.singlefile.ts     # Single-file build (unchanged)
```

**Key structural notes:**
- `lib.rs` is the mobile entry point — uses the `tauri::mobile_entry_point` macro. Desktop uses `main.rs`.
- `gen/apple/` is generated by `tauri ios init` via cargo-mobile2. It creates the Xcode project. Do not manually edit.
- `tauri.ios.conf.json` merges over the base `tauri.conf.json` for iOS-specific settings (bundle ID, minimum OS version, etc.).
- `Info.ios.plist` merges over the base `Info.plist` for iOS-specific keys.

### 3.2 Platform Adapter

The iOS app uses the same `PlatformAdapter` interface as all other targets. At runtime, `window.__TAURI__` is detected and the Tauri adapter is used — the same adapter as macOS. No iOS-specific persistence code is needed.

```
Runtime detection:
  window.__TAURI__ detected?
    → Yes: use Tauri adapter (shared macOS/iOS)
    → No + acquireVsCodeApi?
      → Yes: use VSCode adapter
      → No: use Web adapter (localStorage)
```

The only iOS-specific code lives in:
1. `trackChanges.ts` — the `beforeinput` handler (also benefits macOS on-screen keyboard edge case)
2. CSS — safe area insets, keyboard avoidance, responsive breakpoints
3. A new `SelectionToolbar.tsx` component — floating toolbar for touch users (also benefits web on mobile)

### 3.3 WebView: WKWebView via Wry

Tauri uses Wry, which wraps Apple's native WKWebView on both macOS and iOS. This is the same WebKit engine that powers Safari. The WebView version is tied to the iOS version on the device — no way to bundle a different engine (Apple policy).

**Key implications:**
- Test in Safari first. Any Safari bug will also appear in the Tauri app.
- `localStorage` is **not persistent** between app sessions in WKWebView. This is fine — the Tauri adapter uses file system persistence, not localStorage.
- `contenteditable` behavior in WKWebView has known quirks (see §7).

---

## 4. The `beforeinput` Handler (Critical Path)

### 4.1 The Problem

The track changes intercept model is built on three ProseMirror hooks:

| Hook | Desktop (keyboard) | iOS (virtual keyboard) |
|---|---|---|
| `handleTextInput` | Works | Works — ProseMirror normalizes text input |
| `handlePaste` | Works | Works |
| `handleKeyDown` | Works | **UNRELIABLE** — iOS virtual keyboard fires `key: "Unidentified"` / `keyCode: 229` for most keys including Backspace/Delete |

The W3C spec defines this as expected behavior for virtual keyboards — the OS treats key presses as IME input, not discrete key events.

### 4.2 The Fix

Add `handleDOMEvents.beforeinput` to the TrackChanges plugin. This handler catches `deleteContentBackward`, `deleteContentForward`, and related deletion input types. It is **additive** — existing `handleKeyDown` logic continues to work on desktop.

```typescript
// Addition to TrackChanges extension in trackChanges.ts
handleDOMEvents: {
  beforeinput(view, event) {
    if (!getTrackingEnabled()) return false

    const inputType = event.inputType
    if (
      inputType === 'deleteContentBackward' ||
      inputType === 'deleteContentForward' ||
      inputType === 'deleteWordBackward' ||
      inputType === 'deleteWordForward' ||
      inputType === 'deleteByCut'
    ) {
      // Intercept: apply tracked deletion mark instead of allowing default deletion
      // Implementation mirrors existing handleSingleCharDelete / handleRangeDelete
      // Guard against double-processing when handleKeyDown also fires (desktop)
      event.preventDefault()
      // ... apply deletion mark via transaction
      return true
    }
    return false
  }
}
```

### 4.3 Double-Processing Guard

On desktop browsers, both `handleKeyDown` and `beforeinput` may fire for the same deletion. The guard uses transaction metadata:

```typescript
// In handleKeyDown (existing):
tr.setMeta('fromKeyDown', true)

// In beforeinput handler (new):
// Check if the last transaction was from handleKeyDown for this same edit
// If so, skip — the deletion was already intercepted
```

Alternatively, since `handleKeyDown` returns `true` (handled) on desktop, ProseMirror prevents the default browser action, which means `beforeinput` won't fire at all. On iOS, `handleKeyDown` returns `false` (key was `Unidentified`), so `beforeinput` fires and handles the deletion. This natural fallthrough may make an explicit guard unnecessary — but it must be verified on real devices.

### 4.4 Composition Events

During active IME composition (CJK input, QuickType autocomplete), `beforeinput` fires with `inputType: "insertCompositionText"` and is **not cancelable**. The browser owns the composition lifecycle. Track changes interception must:

1. Detect composition state (`compositionstart` → `compositionend`)
2. Defer tracking decisions until `compositionend`
3. Process the final composed text as an insertion

ProseMirror already handles composition deferral internally. The `beforeinput` handler should skip `insertCompositionText` events entirely.

### 4.5 Acceptance Criteria

- All deletion types (single char backspace, forward delete, word delete, select-and-delete) are correctly intercepted on iOS Safari and iOS Tauri WKWebView
- Existing desktop `handleKeyDown` behavior is unchanged
- Both handlers coexist without double-processing
- CJK composition and QuickType autocomplete work correctly (no disruption, final text is tracked)

---

## 5. iOS UI Adaptations

The web app's layout already handles mobile widths (responsive design from Tier 1). iOS-specific adaptations go beyond CSS breakpoints.

### 5.1 Safe Area Insets

iOS devices have non-rectangular viewports (Dynamic Island/notch at top, home indicator at bottom). The viewport meta tag must include `viewport-fit=cover`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

And CSS must pad content away from unsafe areas:

```css
/* Only applied when running in Tauri iOS (detected via class on <html>) */
.ios-app {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

**Known issue:** `env(safe-area-inset-*)` values may report `0px` briefly after page load (WebKit bug 191872). Set fallback padding that matches expected inset values.

### 5.2 Keyboard Avoidance & Caret Visibility

This is the hardest iOS UX problem. WKWebView's `contenteditable` does **not** automatically scroll to keep the caret visible when the keyboard appears (WebKit bug since iOS 10, never fully resolved).

**Strategy:**

1. Listen to `window.visualViewport` `resize` events to detect keyboard open/close
2. When the keyboard opens, calculate the visible editor area above the keyboard
3. After each text input, check if the caret position is below the visible area
4. If so, `scrollIntoView({ block: 'nearest' })` the caret's DOM node

```typescript
// In a useEffect or editor plugin
const vv = window.visualViewport
if (vv) {
  vv.addEventListener('resize', () => {
    // Keyboard opened or closed
    // Adjust editor container height to visualViewport.height
    // Trigger scroll-to-caret if caret is below viewport
  })
}
```

**Tauri-specific workaround:** The Tauri team has identified a keyboard scroll displacement bug where the entire WebView shifts when the keyboard appears (GitHub issue #9907). A Rust-level `disable_scroll_on_keyboard_show` hook exists as a workaround — this may need to be added to `lib.rs`.

### 5.3 Selection Toolbar (New Component)

On iOS, there is no Cmd key, no Tab key, and no keyboard shortcuts. Actions that are keyboard-driven on desktop need a touch-accessible alternative.

A floating toolbar appears when text is selected in the editor:

```
┌──────────────────────────────────────┐
│  The quick brown {fox jumped} over   │
│  the lazy dog.                       │
│           ┌──────────────────┐       │
│           │ 💬  🖊  📌  ⚡  │       │
│           └──────────────────┘       │
└──────────────────────────────────────┘

💬 = Comment (highlight + focus comment input)  → replaces Cmd+Shift+H
🖊 = Track toggle                               → replaces Cmd+Shift+T
📌 = Highlight                                  → replaces Cmd+Shift+H (standalone)
⚡ = Accept/Reject (future)
```

**Implementation:**

- New component: `src/components/SelectionToolbar.tsx`
- Positioned using ProseMirror's `coordsAtPos` or the browser Selection API's `getBoundingClientRect`
- Appears when:
  - Text is selected AND the platform is touch-capable (or always, as a discoverability aid)
  - OR the cursor is on/adjacent to a tracked change (show comment action)
- Disappears when selection is cleared
- Uses the same store actions as the keyboard shortcuts (no new logic)
- Also benefits web users on mobile Safari (not iOS-specific)

This component is already partially specced in `BACKLOG.md` as "Selection Comment Tooltip" — the iOS target elevates it from backlog to required.

### 5.4 Keyboard Accessory Bar

WKWebView provides a default accessory bar above the keyboard with Previous/Next/Done buttons. This should be replaced or augmented with track-changes-specific actions:

```
┌──────────────────────────────────────────────┐
│  [Undo]  [Redo]  [Track ✓]  [Comment]  [Done]│  ← keyboard accessory bar
├──────────────────────────────────────────────┤
│                iOS Keyboard                   │
└──────────────────────────────────────────────┘
```

**Implementation options (in order of preference):**

a. **Web-based toolbar** — Position a sticky bar at the bottom of the visible viewport using `visualViewport` events. Pure CSS/JS, no native code. Fragile but avoids Swift. *(Recommended for v1.)*

b. **Native `inputAccessoryView`** — Subclass WKWebView in Rust/Swift to provide a custom UIKit `inputAccessoryView`. Requires a Tauri plugin or custom Rust code. Robust but complex.

c. **Tauri plugin** — Use or write a community plugin that provides keyboard toolbar functionality.

### 5.5 Layout: iPhone vs iPad

**iPhone (compact width, < 768px):**
- Full-screen editor
- Changes Panel is a full-height slide-over drawer from the right (existing behavior from responsive Tier 1)
- Source view collapses to a bottom sheet
- Toolbar simplified to essential actions + overflow menu
- No persistent sidebars

**iPad (regular width, >= 768px):**
- Side-by-side layout in landscape: editor (flex-1) + Changes Panel (w-80)
- In portrait: Changes Panel is a slide-over or collapsible sidebar
- Source view spans full width below
- Supports Split View multitasking (two apps side-by-side)

These breakpoints already exist in the web app's responsive CSS. iPad multitasking requires adding `UISupportsMultipleWindows` to `Info.ios.plist`.

### 5.6 Touch Target Sizing

All interactive elements must meet Apple's minimum 44x44pt tap target size:

- Toolbar buttons
- Change cards in the Changes Panel
- Comment inputs
- Selection toolbar buttons
- Import/Export controls

This is the same as Responsive Design Tier 2 in `BACKLOG.md`.

---

## 6. File Operations on iOS

### 6.1 Document Picker (Open)

iOS apps access files via the system document picker (`UIDocumentPickerViewController`), not a desktop-style file dialog. Tauri's `@tauri-apps/plugin-dialog` provides this:

```typescript
import { open } from '@tauri-apps/plugin-dialog'

const file = await open({
  filters: [
    { name: 'Markdown', extensions: ['md', 'markdown'] },
    { name: 'Word Document', extensions: ['docx'] },
  ],
})
```

On iOS, this presents the native Files app picker. The user can select files from iCloud Drive, On My iPhone, or any connected cloud storage provider.

### 6.2 Save

Saving uses the Tauri fs plugin. For files opened via the document picker, the app receives a security-scoped URL that grants read/write access. Cmd+S (with external keyboard) or the toolbar Save button triggers a save.

For new documents (no file path), Save triggers a document picker in "export" mode:

```typescript
import { save } from '@tauri-apps/plugin-dialog'

const path = await save({
  filters: [{ name: 'Markdown', extensions: ['md'] }],
  defaultPath: 'document.md',
})
```

### 6.3 Share Sheet Integration

**Sending (export):**

Use a community Tauri plugin (`tauri-plugin-share` or `tauri-plugin-sharesheet`) to trigger the native iOS Share Sheet. This replaces the web app's download-based export with a native share flow:

```typescript
import { share } from 'tauri-plugin-share'

// Share CriticMarkup as text
await share({ text: criticMarkupString, title: 'Markdown Feedback Export' })

// Or share as a .md file
await share({ file: filePath, mimeType: 'text/markdown' })
```

**Receiving (import):**

Receiving shared files requires a Share Extension target in Xcode. This is non-trivial native iOS work:

1. Add a Share Extension target to the generated Xcode project
2. Configure an App Group container for data sharing between the main app and the extension
3. The extension writes the shared content to the App Group container
4. The main app reads it on next launch

This is **out of scope for v1**. File import via the document picker is sufficient initially.

### 6.4 File Associations

Register the app as a handler for `.md` files so users can "Open in Markdown Feedback" from the Files app or other apps:

```xml
<!-- Info.ios.plist -->
<key>CFBundleDocumentTypes</key>
<array>
  <dict>
    <key>CFBundleTypeName</key>
    <string>Markdown Document</string>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>LSHandlerRank</key>
    <string>Alternate</string>
    <key>LSItemContentTypes</key>
    <array>
      <string>net.daringfireball.markdown</string>
    </array>
  </dict>
</array>
```

`LSHandlerRank: Alternate` means the app appears in the "Open In" menu without claiming to be the default handler for all `.md` files.

---

## 7. Known Limitations & Accepted Defects

### 7.1 Composition Tracking (ACCEPTED LIMITATION)

During CJK input or QuickType autocomplete, `beforeinput` fires with `inputType: "insertCompositionText"` which is **not cancelable**. Track changes interception must wait for `compositionend` to process the final result. This means:

- The user sees uncommitted composition text in the editor without tracking marks
- When composition confirms, the final text is wrapped as an insertion
- If the composition replaced selected text, the deletion is tracked on `compositionend`

This matches how Word and Google Docs handle composition input — composition is inherently non-trackable until committed.

### 7.2 WKWebView Caret Scrolling (REQUIRES WORKAROUND)

WKWebView does not auto-scroll to keep the caret visible in `contenteditable` when typing pushes the caret below the keyboard. This is a long-standing WebKit bug (since iOS 10, rdar://28300343).

**Workaround:** Manual caret tracking using `visualViewport` resize events + `scrollIntoView()`. See §5.2.

### 7.3 WKWebView Keyboard Displacement (REQUIRES WORKAROUND)

Tauri's WKWebView has a bug where the entire WebView shifts when the keyboard appears (Tauri issue #9907). The `disable_scroll_on_keyboard_show` Rust-level hook is the known workaround.

### 7.4 `focus()` Does Not Show Keyboard (iOS RESTRICTION)

Calling `view.focus()` on iOS does not trigger the keyboard to appear. The keyboard only appears on user-initiated tap. This means:

- "Tab to next change" workflow doesn't work on virtual keyboard (no Tab key anyway)
- Programmatic focus (e.g., clicking a change in the Changes Panel to focus the comment input) may not bring up the keyboard
- Workaround: ensure tap targets are directly on the input element, not programmatic `.focus()` calls

### 7.5 `user-select: none` Causes Safari Freeze (AVOID)

Setting `-webkit-user-select: none` on or near the editor causes Safari/WKWebView to freeze (TipTap issue #2853). Avoid `user-select: none` in any ancestor of the editor. Existing Tailwind utility classes that apply this (e.g., `select-none`) must be audited.

### 7.6 External Bluetooth Keyboard Quirks

Tab and arrow keys from a Bluetooth keyboard may not fire `keydown`/`keyup` events in WKWebView. The `beforeinput` handler covers deletion keys; Tab-to-comment may not work with external keyboards until this WebKit bug is resolved.

---

## 8. Implementation Phases

### Phase iOS-0: Prerequisites (Before any iOS work)

**Goal:** Establish the foundation that the iOS app depends on.

- [ ] **Phase 8D — Tauri macOS shell.** Creates `src-tauri/`, validates WKWebView, establishes build pipeline. All Phase 8D deliverables from `docs/desktop-app.md` §9.3.
- [ ] **`beforeinput` handler.** Add `handleDOMEvents.beforeinput` to TrackChanges plugin for `deleteContentBackward` / `deleteContentForward` / `deleteWordBackward` / `deleteWordForward` / `deleteByCut`. Verify on iOS Safari via `markdown-feedback.com`.
- [ ] **Safari mobile testing.** Open the web app in Safari on iPhone and iPad. Perform a full editing session: type, delete (with `beforeinput` handler), substitute, comment, import, export. File any Safari-specific bugs as blockers.

### Phase iOS-1: Tauri iOS Shell

**Goal:** The existing web app running in a native iOS window. No iOS-specific features — just validate the runtime.

**Deliverables:**
- `tauri ios init` to generate the Xcode project in `gen/apple/`
- `tauri.ios.conf.json` with iOS-specific overrides (bundle ID, minimum iOS version 16.0, etc.)
- `Info.ios.plist` with viewport and safe area configuration
- `npm run tauri ios dev` works in the simulator
- Editor loads, text input works, tracked changes appear correctly
- Verify: `beforeinput` handler intercepts deletions on iOS virtual keyboard

**Verification:** Type in the editor on iOS Simulator → tracked changes appear. Delete text → deletion is tracked (not truly removed). Substitute → substitution tracked. All behaviors match the web app.

**Known issues to watch for:**
- Keyboard displacement (§7.3) — may need `disable_scroll_on_keyboard_show` immediately
- Caret visibility (§7.2) — may not scroll into view when typing at the bottom
- `localStorage` not persistent — should not matter since Tauri adapter uses file system, but verify recovery modal does not appear spuriously

### Phase iOS-2: Touch Adaptations

**Goal:** Make the editing experience feel native on iPhone and iPad.

**Deliverables:**
- Safe area inset CSS (§5.1) — content respects Dynamic Island and home indicator
- Keyboard avoidance (§5.2) — caret stays visible when keyboard is open
- Selection Toolbar component (§5.3) — floating toolbar with comment/highlight/toggle actions
- Keyboard accessory bar (§5.4) — web-based toolbar positioned above the keyboard with Undo/Redo/Track/Comment/Done
- Touch target sizing (§5.6) — all interactive elements ≥ 44x44pt
- Overscroll prevention — `overscroll-behavior: none` on the editor container

**Verification:** Edit a document on a real iPhone (not just simulator — virtual keyboard behavior differs). All track-changes operations work via touch. Caret stays visible when typing near the bottom. Changes Panel opens/closes via toggle. Comment input is accessible via Selection Toolbar.

### Phase iOS-3: File Operations

**Goal:** Open and save `.md` files via the iOS Files app.

**Deliverables:**
- Document picker integration (§6.1) — open `.md` and `.docx` files from Files app / iCloud Drive
- Save to file (§6.2) — save back to the same file path, or Save As via document picker
- File associations (§6.4) — app appears in "Open In" menu for `.md` files
- Share sheet export (§6.3) — send CriticMarkup/clean/original to other apps via native share sheet

**Verification:** Open a `.md` file from Files app → edit → save → reopen → changes preserved. Open a `.docx` → tracked changes imported. Share → CriticMarkup text arrives in the target app (Notes, Mail, etc.).

### Phase iOS-4: App Store Preparation

**Goal:** Prepare for TestFlight and App Store submission.

**Deliverables:**
- App icon (all required iOS sizes, generated via `tauri icon`)
- Splash/launch screen configuration
- App Store metadata (description, keywords, category: Productivity)
- Screenshots for App Store listing (iPhone 6.7", iPhone 6.1", iPad 12.9")
- Privacy policy URL (required)
- TestFlight build and internal testing
- Code signing and provisioning profiles for App Store Connect
- `npm run tauri ios build -- --export-method app-store-connect`
- Upload via `xcrun altool` or Xcode's Organizer

**Verification:** TestFlight build installs and runs on a real iPhone. All editing operations work. File open/save works. No crashes during a 30-minute editing session.

### Phase iOS-5: Polish & Future

**Deliverables (unordered):**
- iPad multitasking (Split View, Slide Over) — `UISupportsMultipleWindows` in `Info.ios.plist`
- Haptic feedback on tracked change creation (subtle tap on deletion/insertion)
- Share Extension for receiving shared text (§6.3 — non-trivial native work)
- Dark mode propagation to safe area / status bar
- Performance profiling on older devices (iPhone 12 or equivalent — minimum viable hardware)
- Siri Shortcuts integration ("Open last document in Markdown Feedback")
- Widget for quick document access (iOS 17+ WidgetKit)

---

## 9. Testing Strategy

### Simulator vs. Real Device

| What | Simulator | Real Device |
|---|---|---|
| Layout / safe areas | Yes (approximated) | Yes (accurate) |
| Virtual keyboard behavior | **No** — keyboard doesn't appear; uses Mac keyboard | **Yes** — essential |
| `beforeinput` event timing | Partial | Accurate |
| Touch selection handles | No | Yes |
| Performance / typing latency | Not representative | Accurate |
| Bluetooth keyboard | No | Yes |

**Real device testing is mandatory** for keyboard interaction, `beforeinput` handler validation, and performance. The simulator is useful for layout verification only.

### Debugging

Use Safari Web Inspector to debug the WKWebView:

1. Safari > Settings > Advanced > "Show features for web developers"
2. On iPhone: Settings > Safari > Advanced > Web Inspector = ON
3. Connect iPhone to Mac via USB
4. Safari Develop menu shows the connected device's WebView
5. Full DOM inspector, console, network tab, and JS debugger

### Test Matrix

| Test Case | Expected Behavior |
|---|---|
| Type text | Wrapped in `trackedInsertion` mark (green) |
| Backspace on original text (virtual keyboard) | `beforeinput` intercepts → tracked deletion (red strikethrough) |
| Select original + type | Substitution (deletion + insertion, linked via `pairedWith`) |
| Backspace on already-deleted text | Cursor skips over deletion span |
| Edit within insertion | Normal edit (no tracking) |
| Delete within insertion | Text truly removed |
| QuickType autocomplete | Composed text tracked as insertion on `compositionend` |
| CJK input | Composition completes → tracked as insertion |
| Rotate device | Layout adapts (iPhone: full-width; iPad: side-by-side if landscape) |
| Open keyboard | Editor scrolls to keep caret visible |
| Dismiss keyboard | Editor returns to full height |
| Open `.md` from Files app | File loads in editor with tracked changes reconstructed |
| Cmd+S (external keyboard) | File saved to disk |
| Three-finger undo gesture | Undo last tracked change operation |
| Long-press for selection | iOS selection handles appear; Selection Toolbar shows |
| Background/foreground app | State preserved (no data loss) |

---

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `beforeinput` handler doesn't fully cover iOS deletion edge cases | Medium | High | Test on real device early (Phase iOS-0). ProseMirror community has extensive iOS testing. |
| WKWebView keyboard displacement breaks editing | Medium | High | Rust-level `disable_scroll_on_keyboard_show` workaround exists. Apply in Phase iOS-1. |
| Caret visibility workaround is unreliable | Medium | Medium | Multiple approaches: `scrollIntoView`, `visualViewport` events, manual scroll calculation. Test each. |
| TipTap/ProseMirror composition handling regresses on new iOS version | Medium | Medium | Pin to stable ProseMirror versions. Test on iOS beta releases before shipping. |
| Typing latency in WKWebView degrades UX | Low | High | Obsidian (Capacitor/WKWebView) ships a successful iOS editor. Monitor performance on older devices. |
| App Store rejection for "wrapped website" (Guideline 4.2) | Low | High | App has native file I/O, keyboard toolbar, share sheet — substantive native features beyond a web wrapper. |
| Share Extension complexity delays v1 | Medium | Low | Defer to Phase iOS-5. Document picker import is sufficient for v1. |
| Tauri iOS tooling immaturity causes friction | High | Medium | Tauri iOS is early-stage. Budget extra time. Use `--open` flag to work in Xcode directly when needed. |

---

## 11. Design Decisions

**Tauri 2, not Capacitor or React Native.** The macOS target already uses Tauri (Phase 8D). Sharing the same `src-tauri/` project means zero additional framework setup. Capacitor (Obsidian's choice) is a viable alternative but would require a separate project structure. React Native would require rewriting the entire UI.

**`beforeinput` handler is additive, not a replacement.** The existing `handleKeyDown` logic continues to work on desktop. The `beforeinput` handler is a parallel interception path that activates on platforms where `keydown` is unreliable. Both handlers coexist without modification to the existing codebase.

**Selection Toolbar ships to all platforms.** The floating toolbar with comment/highlight/toggle actions is useful for all touch users, not just iOS. It's implemented as a React component that appears based on selection state, not platform detection. Desktop users who prefer keyboard shortcuts never see it.

**Web-based keyboard toolbar over native `inputAccessoryView`.** A web-based toolbar positioned above the keyboard avoids the complexity of custom Rust/Swift code for a native `inputAccessoryView`. It's fragile (depends on `visualViewport` events) but ships faster and is iterable from the React codebase.

**iOS 16.0 minimum deployment target.** iOS 16 introduced paste permission controls and is the oldest version still receiving security updates. iOS 15 support would be possible but adds testing burden for minimal reach.

**Defer Share Extension to Phase iOS-5.** Receiving shared content requires a native iOS Share Extension target, App Group container, and inter-process communication. This is significant native work that Tauri does not abstract. Document picker import is the v1 path for getting content into the app.

---

## 12. References

- [Tauri 2 Documentation](https://v2.tauri.app/)
- [Tauri iOS Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri iOS Code Signing](https://tauri.app/distribute/sign/ios/)
- [Tauri App Store Distribution](https://v2.tauri.app/distribute/app-store/)
- [Tauri WebView Versions](https://v2.tauri.app/reference/webview-versions/)
- [Wry macOS/iOS WKWebView](https://deepwiki.com/tauri-apps/wry/3.2-macosios-(wkwebview))
- [Tauri iOS Keyboard Displacement — Issue #9907](https://github.com/tauri-apps/tauri/issues/9907)
- [Tauri visualViewport Keyboard Height — Issue #10631](https://github.com/tauri-apps/tauri/issues/10631)
- [Tauri Community iOS Feedback — Discussion #10197](https://github.com/tauri-apps/tauri/discussions/10197)
- [W3C Input Events Level 2 Spec](https://w3c.github.io/input-events/index.html)
- [MDN: beforeinput Event](https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event)
- [MDN: InputEvent.inputType](https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/inputType)
- [ProseMirror View Changelog (iOS fixes)](https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md)
- [ProseMirror: handleKeyDown not firing on backspace](https://discuss.prosemirror.net/t/handlekeydown-sometimes-not-firing-on-backspace/4245)
- [TipTap: Safari freeze with user-select: none — Issue #2853](https://github.com/ueberdosis/tiptap/issues/2853)
- [WKWebView Caret Scroll Bug (rdar://28300343)](https://github.com/lionheart/openradar-mirror/issues/15840)
- [CKEditor 5: iOS Caret Offscreen — Issue #1321](https://github.com/ckeditor/ckeditor5/issues/1321)
- [WebKit Bug 191872: env(safe-area-inset-*) Delayed](https://bugs.webkit.org/show_bug.cgi?id=191872)
- [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Apple HIG: Split Views](https://developer.apple.com/design/human-interface-guidelines/split-views)
- [Capacitor Keyboard Plugin](https://capacitorjs.com/docs/apis/keyboard)
- [Desktop App Spec (Phase 8)](docs/desktop-app.md) — Tauri architecture, platform adapter pattern
- [VSCode Extension Spec (Phase 9)](docs/vscode-extension.md) — Platform adapter implementation reference
- [CriticMarkup Specification](http://criticmarkup.com/spec.php)
