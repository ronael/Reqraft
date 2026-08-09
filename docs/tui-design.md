# Reqraft Terminal Design

Reqraft uses a terminal-first visual language built around precision, calm and
fast keyboard use. The interactive interface is rendered with OpenTUI in
`src/opentui/`, while product state and formatting rules remain in shared
modules under `src/ui/`.

## Visual Roles

- Violet marks the product, focused panels, active shortcuts and selection.
- Contextual values such as provider, model, profile and level stay neutral.
- Gray is reserved for borders, secondary copy and unavailable actions.
- Emerald, amber and rose communicate success, warning and failure, always with
  text or a symbol so meaning never depends on color alone.
- Body text inherits the terminal foreground. Backgrounds are not painted.

## Degradation

`src/ui/theme/capabilities.ts` resolves terminal capabilities once per run.
Color is dropped when `NO_COLOR` is set, when `TERM=dumb`, or when stdout is not
a TTY. Unicode symbols fall back to ASCII when the terminal is unlikely to
render them reliably.

No component should hardcode a semantic color, symbol or border style when a
shared helper exists.

## Components

```text
src/ui/
  app-actions.ts
  app-state.ts
  errors.ts
  generation-state.ts
  modal-options.ts
  prompt-input.ts
  result-meta.ts
  result-view.ts
  shortcut-hints.ts
  shortcut-intents.ts
  shortcuts.ts
  theme/
  view-labels.ts

src/opentui/
  app.tsx
  input.ts
  layout.ts
  launcher.ts
  scroll-view.tsx
  text-viewport.tsx
  theme.ts
```

The OpenTUI renderer wires terminal events to application use cases. Pure UI
decisions belong in `src/ui/` so they can be unit-tested without rendering the
terminal app.

## Responsive Behavior

- The frame is capped at 118 columns so wide terminals stay readable.
- Compact mode is selected for narrow or short terminals.
- Editor and result panels receive fixed viewport heights from
  `src/opentui/layout.ts`.
- Long prompt and result content scrolls inside dedicated OpenTUI scrollboxes.
- The footer is always reserved outside scrollable content.

## Interaction Contract

- `Enter`: generate.
- `Ctrl+C`: cancel a running generation, quit when idle.
- `Ctrl+K`: actions.
- `Ctrl+P`: profile.
- `Ctrl+L`: level.
- `Ctrl+I`: provider.
- `Ctrl+O`: model.
- `Ctrl+D`: diff.
- `Ctrl+Y`: copy.
- `?`: help.
- `Esc`: close overlay or quit.

Control shortcuts must never insert their letter into the editor. Provider
errors are converted to short actionable messages and never expose credentials.

## Non-Interactive Output

Commands such as `rp doctor`, `rp profiles`, `rp providers` and `rp models`
stay console-oriented. Rewritten prompts go to stdout; diagnostics, stats and
quality notices go to stderr so pipes remain clean.
