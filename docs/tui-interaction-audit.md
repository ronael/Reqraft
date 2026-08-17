# TUI interaction audit (Lot 1)

Audit of the interactive TUI before the interaction-foundation pass.
Scope: `src/opentui/`, `src/ui/`, the OpenTUI 0.4.5 API surface, and the
OpenCode TUI as architectural reference (not a design reference).

## Current architecture

- The TUI is a single React screen: `src/opentui/app.tsx` (~1060 lines) renders
  through `@opentui/react` (`createRoot` + `createCliRenderer`), launched under
  Bun via `src/opentui/launcher.ts` (OpenTUI's native FFI has no Node build).
- Product state lives in shared, tested modules under `src/ui/`
  (`app-state.ts`, `modal-options.ts`, `prompt-input.ts`, `generation-state.ts`,
  `result-view.ts`, ...). That split is sound and is preserved.
- Presentation helpers live in `src/opentui/`: `layout.ts` (row budget + mouse
  hit zones), `text-viewport.tsx` / `diff-viewport.tsx` (wrapped scroll areas),
  `scroll-view.tsx` (thin `scrollbox` wrapper), `verdict.tsx`, `scan-line.tsx`,
  `help-overlay.tsx`, `theme.ts`, `text.ts`.
- OpenTUI primitives used today: `box`, `text`, `span`, `scrollbox`.
  **Not used**: `textarea`, `input`, `select`, `tab-select`, the native focus
  system, per-renderable mouse handlers, `@opentui/keymap`.

### Interaction handling today

| Concern        | Where                                                        | Mechanism                                                                 |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Keyboard       | `app.tsx` `useKeyboard` (one handler, if-chain)              | interrupt → modal → escape → tab → ctrl shortcuts → `?` → editor keys     |
| Mouse          | `app.tsx` `renderer.on("mouse")`                             | manual hit-test against `layout.badgeZones` and `pickerOptionIndexAt`     |
| Focus          | `app.tsx` `focusedElement` React state (`"editor" \| "result"`) | manual toggle on Tab; `focused` prop drives border style only           |
| Input          | `EditorViewport` = `TextViewport` + `█` when focused         | fake caret; no cursor movement, no selection, backspace at end only       |
| Modals         | `Picker` / `HelpOverlay` absolute boxes                      | manual up/down/enter/escape in `handleOverlayKey`; no focus capture       |
| Scroll         | `ScrollView` → native `scrollbox`                            | real scroll; `TextViewport` pre-wraps text itself and pads lines          |
| Paste          | `usePaste` + `Ctrl+V` clipboard fallback                     | two parallel paths                                                        |

## Problems found

1. **Fake input** (`app.tsx:714`): the prompt is a `TextViewport` with a `█`
   character appended when "focused". No real caret, no Left/Right/Home/End,
   no word movement, no selection, backspace deletes the last character only,
   paste appends at the end. This is the single biggest interaction debt.
2. **Manual mouse hit-testing** (`layout.ts:84-96`, `app.tsx:257-288`):
   `badgeZones` are computed from label string lengths
   (`cursor + label.length + 3`) — locale-dependent and wrong as soon as the
   row wraps or a value changes length; the hitbox covers the badge text only,
   not the full visual row. `pickerOptionIndexAt` assumes a fixed 2-row
   spacing between options.
3. **No native focus**: OpenTUI's `focus()` / `focused` /
   `renderer.currentFocusedRenderable` are unused, so there is no focus
   capture on modal open and no focus restoration on close.
4. **One global keyboard handler, no contexts**: every key is resolved in one
   if-chain. `?` only opens help when the input is empty (a hack to avoid
   stealing the character). Adding a screen means editing the chain.
5. **Dead Ink-era code**: `src/ui/shortcuts.ts`, `shortcut-intents.ts`,
   `shortcut-hints.ts`, `select-list.ts`, `command-intents.ts`,
   `hooks/use-terminal-size.ts`, `layout/responsive.ts`, `theme/` are only
   referenced by tests — the OpenTUI app re-implemented shortcut resolution
   inline instead of using them.
6. **Modal focus not managed**: opening a picker does not move focus, the
   backdrop does not neutralize the screen behind, Escape handling is manual.
7. **Duplicated text wrapping**: `wrapText` in `text.ts` re-implements what
   the native renderables do, and `TextViewport` pads every line to full
   width, which fights the scrollbar column.

## What OpenTUI 0.4.5 already provides

- **`<textarea>` / `<input>`** (`TextareaRenderable` / `InputRenderable`):
  native `EditBuffer` (grapheme-aware cursor, selection, undo/redo, word
  boundaries) + `EditorView` (viewport, visual lines), caret with style and
  blink, placeholder, focused/unfocused colors, full keybinding set
  (arrows, Home/End, buffer home/end, word motion, backspace/delete,
  select-all), `onSubmit`, `onPaste`, `onKeyDown`, `onContentChange`,
  `onCursorChange`, `onMouseDown`, `traits` capture flags.
- **`<select>`**: native list with keyboard navigation, selection indicator,
  scroll indicator, per-state colors.
- **`<scrollbox>`**: real scrolling, scrollbar, `scrollY`, focus, wheel.
- **`<tab-select>`**: native tabs.
- **Focus system**: `focus()`, `blur()`, `focusable`, `focused`,
  `hasFocusedDescendant`, `renderer.currentFocusedRenderable`,
  `CliRenderEvents.FOCUSED_RENDERABLE`.
- **Mouse**: per-renderable `onMouseDown/Up/Move/Over/Out/Scroll` with
  built-in hit-testing — a handler on a box covers the box's whole surface.
- **`@opentui/keymap@0.4.5`** (official package, same version as core):
  layers with priorities, `enabled` conditions, local bindings scoped to a
  renderable (`target` + `targetMode: "focus-within"`), named commands,
  `preventDefault` semantics (a matched key does not reach the focused
  renderable), React bindings (`KeymapProvider`, `useBindings`,
  `useActiveKeys`), `createDefaultOpenTuiKeymap(renderer)` host, and a test
  harness.
- **Testing**: `testRender` from `@opentui/react/test-utils` with
  `mockInput` (typeText, pressKey, pressArrow, pasteBracketedText),
  `mockMouse` (click, drag, scroll), `captureCharFrame`, `waitForFrame`,
  `resize`. Already used by `scripts/tui-snapshot.tsx`.

## How OpenCode solves the same problems (reference)

OpenCode (`packages/tui`, Solid-based) uses the same OpenTUI core. Relevant
architecture, not design:

- **Keymap**: `createDefaultOpenTuiKeymap(renderer)` + a mode stack
  (`base` → `modal` pushed while any dialog is open) + `useBindings` layers
  with `enabled` conditions and `target`-scoped local bindings. Input-editing
  keys are handled by the native textarea itself; the keymap only claims
  real shortcuts (modified keys, Escape, Enter), so typing never collides
  with global bindings.
- **Prompt**: native `<textarea>` with `ref` for imperative focus,
  `onContentChange` for value sync, `onSubmit`, `onPaste` with
  `preventDefault`, and `onMouseDown={(e) => e.target?.focus()}` for
  click-to-focus.
- **Dialogs**: a provider holds a stack; on first open it captures
  `renderer.currentFocusedRenderable` and blurs it, restores focus on close
  (with a still-mounted check), registers Escape/Ctrl+C bindings that are
  `enabled` only while the stack is non-empty, and closes on backdrop click
  (inner content stops propagation).
- **Select dialog**: every row is a `box` carrying the mouse handlers
  (hover moves the highlight, click selects) — the whole row is the hitbox;
  keyboard navigation is a set of keymap commands (prev/next/page/home/end/
  submit, Tab for footer actions); a native `<input>` filter auto-focuses;
  a native `<scrollbox>` keeps the selection visible; a keyboard/mouse mode
  flag prevents hover from fighting keyboard navigation.
- **Tests**: `testRender` + `mockInput`/`mockMouse` + frame assertions, and
  the keymap test harness for binding resolution.

### What is taken, what is not

| OpenCode element            | Decision for Reqraft                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `@opentui/keymap` layers    | **Adopt** — official OpenTUI package at our exact version; gives base/modal/select contexts without a custom framework |
| Mode stack (WeakMap API)    | **Simplify** — Reqraft has three contexts; `enabled` conditions on layers are enough |
| Commands + palette          | **Skip** — Reqraft has no command palette; bindings call handlers directly           |
| Leader keys, keybind config | **Skip** — no user-configurable keybindings in Reqraft today                          |
| Solid                       | **Skip** — Reqraft stays on `@opentui/react`                                         |
| Dialog stack                | **Adapt** — Reqraft opens one overlay at a time; a single-slot modal with the same focus capture/restore contract |
| Native `<select>`           | **Not for the pickers** — the picker's look (`›` + `●` markers) is product identity; the `Select` primitive composes `ActionRow` + `ScrollArea` instead. Native `<select>` stays available for future needs |
| Fuzzy filter in dialogs     | **Skip for now** — Reqraft pickers have ≤ 8 options                                  |

## Target direction

```text
Design Reqraft (theme.ts, docs/design/)
      ↓
Composants UI Reqraft (src/ui/components/: TextInput, Button, ActionRow,
Select, Modal, ScrollArea)
      ↓
Contrats d'interaction (src/ui/interaction/: keymap layers base/modal/select,
focus rules, mouse rules)
      ↓
OpenTUI (@opentui/core + @opentui/react + @opentui/keymap)
```

Screens compose primitives; they never re-implement caret, hitboxes, focus
capture, or shortcut resolution.
