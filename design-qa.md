# Welcome Tour Design QA

## Evidence

- Source visual truth: the production Electron renderer at this commit,
  captured in its real capsule input/result, popover, Profiles and Providers
  states. Component structure and metrics come from `CapsuleApp`, `PopoverApp`,
  `SettingsApp` and `desktop.css`.
- Secondary composition references:
  `docs/design/reqraft-native-ui-v2-repo-aligned.html` and
  `docs/design/reqraft-native-ui.html`. They inform the host Mail, ChatGPT and
  code contexts, but no longer define Reqraft's own controls.
- Current implementation slides 1 to 6:
  `docs/design/welcome-tour-rendered-states.webp`, in reading order.
- CSS viewport: 680 x 600 macOS Electron window, dark mode, French locale.
- Current renderer captures are 1360 x 1200 device pixels for a 680 x 600 CSS
  viewport. The six-state WebP is a 3 x 2 contact sheet at 1848 x 1090.

## Full-View Comparison

Each slide is grounded in a concrete product surface: Mail, ChatGPT, a code
editor, profile settings, provider settings and the privacy state. Selection
flows reproduce the shipped result capsule, ChatGPT uses the shipped
no-selection popover hierarchy, and configuration reproduces the vertical
settings sidebar, context panel, cards, rows and statusbar. No raster
illustration is needed because the visual content is product UI with the Lucide
icons already used by the desktop app.

## Focused Comparison

- Typography: system macOS stack, weights and wrapping remain readable in the
  real 680 x 600 window. The longest French provider title and final CTA fit.
- Spacing: the scene and footer remain visible without scrolling on all six
  slides. Capsules overlap host apps intentionally and never cover replay or
  navigation controls.
- Colors: neutral dark surfaces, violet selection/focus and green fidelity
  states match the source direction without turning the whole screen purple.
- Motion: selection, shortcut, capsule, result and verdict enter in sequence.
  Profile cards, provider rows and secondary controls are staggered; the active
  progress bullet visibly stretches while the previous one contracts. Motion
  runs once, can be replayed, and is removed by
  `prefers-reduced-motion: reduce`.
- Copy: French and English keys exist for every visible label. The tour names
  only supported providers and profiles, and keeps setup details out of the
  primary daily workflow.

## Comparison History

1. Initial pass found a P2 contrast/state issue: background-window throttling
   made the capsule appear absent in captures and the scene read as an empty
   editor. Re-capturing the focused window after the one-shot animation proved
   the intended final state; no code workaround or looping animation was added.
2. Expanding the tour to six slides exposed a P2 footer collision on slide 6:
   the active progress indicator met the wider `Configurer Reqraft` action. The
   navigation column now reserves a stable width and leaves a measured 16 px
   gap at 680 x 600.
3. Independent review caught two false setup-state labels (`12 profils` and
   `1 configuré`). Both were removed; profile and provider names are now
   checked against the product catalogues by a unit test.
4. Progress targets keep a 24 px centre-to-centre spacing while their visual
   dots remain compact. The last active dot stays clear of the final action.
5. A fidelity review against the running product replaced the invented
   sparkle mark, horizontal settings tabs, simplified result cards and privacy
   columns with the real `rq` capsule, popover controls and vertical settings
   shell. DeepSeek was restored to the built-in provider list.
6. Post-fix captures show no remaining P0, P1 or P2 mismatch. Every slide
   measures 680 x 600 with no document overflow, and every scene ends before
   the footer.
7. The densest slides were also rendered at the supported 560 x 520 minimum
   viewport. Their content and footer remain visible without document overflow.
8. The Mail shortcut now uses the same shared accelerator formatter as
   Settings. One compact `Cmd + Ctrl + R` key replaces three oversized keycaps;
   the full hint shrank from 192 px to 101 px without losing the Reqraft mark.

## Residual Checks

- Synthetic macOS keystrokes remain unavailable without Accessibility
  permission. Arrow navigation is covered by the event handler and unit/build
  checks; the six dot controls were exercised through the production renderer
  during capture, and the packaged checklist retains the manual keyboard pass.

final result: passed
