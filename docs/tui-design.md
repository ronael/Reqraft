# Reqraft terminal design

Reqraft uses a terminal-first visual language built around precision, calm and
fast keyboard use. The interface deliberately avoids dashboard-like decoration:
color communicates hierarchy or status, while spacing and typography carry most
of the structure.

## Visual roles

The palette comes from `reqraft-cli-ui.html`.

- Violet (`#a78bfa`, strong `#8b5cf6`) marks the product, focused panels, active
  shortcuts and selection. It is the identity colour.
- Contextual values — provider, model, profile, level — stay neutral. Colour is
  spent on focus and status, not on data.
- Gray is reserved for borders, secondary copy and unavailable actions.
- Emerald, amber and rose communicate success, warning and failure, always with
  a symbol so meaning never depends on colour alone.
- Primary panels use rounded borders. Secondary panels use simple borders.
  Context rows and shortcuts remain unframed.

Body text sets no colour at all: the terminal foreground is inherited so the
interface stays readable on light and dark themes alike. Backgrounds are never
painted.

## Degradation

`src/ui/theme/capabilities.ts` resolves what the terminal can do, once per run.

Colour is dropped entirely when `NO_COLOR` is set, when `TERM=dumb`, or when
stdout is not a TTY. Every role then collapses to the terminal default, and the
status symbols carry the meaning on their own:

```text
✓ success   ! warning   × error   ● active   ○ inactive
```

Unicode is assumed only under a UTF-8 locale, and on Windows only under Windows
Terminal or a known host. Otherwise the ASCII set replaces the glyphs
(`+ ! x * o`) and borders fall back to the `classic` style (`+---+`).

The palette, symbols and capability detection live in `src/ui/theme/`. Shared
components live in `src/ui/components/`; no component should hardcode a
semantic colour, a symbol or a border style.

## Components

```text
src/ui/
├── app-actions.ts
├── app-state.ts
├── components/
│   ├── app-modal.tsx
│   ├── app-frame.tsx
│   ├── empty-state.tsx
│   ├── header-bar.tsx
│   ├── meta-row.tsx
│   ├── notice.tsx
│   ├── result-panel-body.tsx
│   ├── section-card.tsx
│   ├── select-modal.tsx
│   ├── shortcut-bar.tsx
│   ├── spinner.tsx
│   └── status-badge.tsx
├── modal-options.ts
├── result-view.ts
├── layout/responsive.ts
├── theme/palette.ts
├── theme/tokens.ts
├── theme/types.ts
└── view-labels.ts
```

`src/app.tsx` should stay a composition shell: it wires Ink, application use
cases and state setters. Pure UI decisions belong in `app-state`,
`app-actions`, `modal-options`, `result-view` or focused components so they can
be unit-tested without rendering the full terminal app.

## Responsive behavior

- `wide`, from 76 columns: complete identity, context and shortcut set.
- `compact`, from 52 to 75 columns: shorter header and essential shortcuts.
- `narrow`, below 52 columns: no horizontal padding and only essential context.
- The content frame is capped at 112 columns so large terminals remain readable.

Long content wraps inside panels. Provider and model metadata are reduced before
the input or result loses space.

## Interaction contract

`Enter` generates, `Ctrl+K` opens the action palette, `Ctrl+P`, `Ctrl+L` and
`Ctrl+M` change context, `Ctrl+D` opens the diff, `Ctrl+Y` copies, `?` opens
help, and `Esc` returns or exits. Every modal repeats its navigation footer.

Loading, empty, success and error states keep the same footprint. Provider
errors are converted to short actionable messages and never expose raw response
bodies or credentials.

## Non-interactive output

Commands such as `rp doctor`, `rp profiles`, `rp providers` and `rp models`
share the same headings. ANSI color is only emitted to a TTY and is disabled by
`NO_COLOR`, preserving clean pipes and logs.
