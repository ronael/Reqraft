# Welcome Tour Design QA

## Evidence

- Source visual truth: left panel of
  `docs/design/welcome-tour-option-3-comparison.webp`, derived from the selected
  ImageGen option 3.
- Implementation slide 1: right panel of
  `docs/design/welcome-tour-option-3-comparison.webp`.
- Implementation slides 1 to 3:
  `docs/design/welcome-tour-rendered-states.webp`, in order from left to right.
- CSS viewport: 680 x 600 macOS Electron window, dark mode, French locale.
- Source pixels: 1333 x 1180. Implementation capture pixels include the macOS
  window shadow: 1496 x 1336 for slides 1 and 2, 1584 x 1424 for slide 3.
  The committed WebP comparison is normalized to 1800 x 850; both source panels
  represent the same 680 x 600 CSS viewport.

## Full-View Comparison

The implementation preserves the selected direction: a compact heading, a
large editor context, an anchored Reqraft capsule, stable navigation and a
single violet accent with green confirmation. The production version gives the
capsule slightly more text contrast and uses the real title bar and controls.
No raster or custom illustration asset is needed; the visual content is the
actual product UI and Lucide icons already used by the desktop app.

## Focused Comparison

- Typography: system macOS stack, weights and wrapping remain readable in the
  real 680 x 600 window. The longest French title and final CTA fit.
- Spacing: the scene and footer remain visible without scrolling on all three
  slides. The capsule overlaps the editor intentionally and never covers the
  replay or navigation controls.
- Colors: neutral dark surfaces, violet selection/focus and green fidelity
  states match the source direction without turning the whole screen purple.
- Motion: selection, shortcut, capsule, result and verdict enter in sequence.
  Motion runs once, can be replayed, and is removed by
  `prefers-reduced-motion: reduce`.
- Copy: French and English keys exist for every visible label. Dedicated short
  level labels prevent truncation in the compact capsule.

## Comparison History

1. Initial pass found a P2 contrast/state issue: background-window throttling
   made the capsule appear absent in captures and the scene read as an empty
   editor. Re-capturing the focused window after the one-shot animation proved
   the intended final state; no code workaround or looping animation was added.
2. Initial slide 2 pass found a P2 copy-fit issue: full onboarding level
   descriptions were truncated. The tour now uses translated `Minimal`,
   `Standard` and `Complete` labels.
3. Post-fix captures show no remaining P0, P1 or P2 mismatch. No console error
   was emitted by the Electron renderer or main-process session during the
   three captures.

## Residual Checks

- Synthetic macOS keystrokes remain unavailable without Accessibility
  permission. Arrow navigation is covered by the existing event handler and
  unit/build checks; the manual desktop checklist still covers the packaged
  keyboard pass.

final result: passed
