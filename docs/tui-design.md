# Reqraft terminal design

Reqraft uses a terminal-first visual language built around precision, calm and
fast keyboard use. The interface deliberately avoids dashboard-like decoration:
color communicates hierarchy or status, while spacing and typography carry most
of the structure.

## Visual roles

- Cyan marks the product, focused panels, active shortcuts and selection.
- Blue identifies contextual values such as provider, model, profile and level.
- Gray is reserved for borders, secondary copy and unavailable actions.
- Green, yellow and red communicate success, warning and failure with a textual
  prefix so meaning never depends on color alone.
- Primary panels use rounded borders. Secondary panels use simple borders.
  Context rows and shortcuts remain unframed.

The palette and semantic types live in `src/ui/theme/`. Shared components live
in `src/ui/components/`; no component should hardcode a semantic color.

## Components

```text
src/ui/
├── components/
│   ├── app-frame.tsx
│   ├── empty-state.tsx
│   ├── header-bar.tsx
│   ├── meta-row.tsx
│   ├── notice.tsx
│   ├── section-card.tsx
│   ├── select-modal.tsx
│   ├── shortcut-bar.tsx
│   ├── spinner.tsx
│   └── status-badge.tsx
├── layout/responsive.ts
├── theme/palette.ts
├── theme/tokens.ts
└── theme/types.ts
```

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
