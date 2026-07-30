# TUI implementation — audit (Lot A)

Audit of `reqraft-cli-ui.html` against the current implementation, as required
by DA.md section 1. Written before any visual change.

## Method

Compared the 33 mockup screens in `reqraft-cli-ui.html` against `src/app.tsx`,
`src/ui/`, `src/cli.tsx` and `src/commands/`.

## What already exists

The interactive TUI is a single Ink screen composed in `src/app.tsx`:

- `AppFrame` → `HeaderBar` → input `SectionCard` → context badges →
  result `SectionCard` → `ShortcutBar` → copy toast.
- Modals (`profile`, `level`, `provider`, `model`, `commands`, `help`) replace
  the whole screen through an early return.
- Views `result`, `diff`, `explain` switch the result panel content.

The architecture is already sound and must be preserved: presentation logic
lives in pure, tested modules (`app-state.ts`, `shortcuts.ts`,
`shortcut-intents.ts`, `command-intents.ts`, `view-labels.ts`,
`generation-state.ts`, `modal-options.ts`), and components stay thin. Business
logic is reached through `application/` use cases.

`src/ui/screens/` exists but is empty.

## Coverage of the 33 mockup screens

| Mockup screens | State today |
| --- | --- |
| 1–2 main idle / filled | Ink, needs restyling |
| 3 generation in progress | **Missing as designed** — spinner only, no streaming |
| 4 result | Ink, needs restyling |
| 5–6 diff / explain | Ink, plain text render |
| 7–11 command palette, pickers, help | Ink, but full-screen swap instead of overlay |
| 12–18 init wizard | **Not Ink** — `readline` flow in `commands/first-run.ts` |
| 19–24 doctor, config, profiles, models, providers, alias | **Not Ink** — `console.log` in `commands/` |
| 25–28 error and secret-warning states | Partial — generic `Notice`, no structured error |
| 29 confirmation | **Not Ink** — `askConfirm` on `readline` |
| 30–31 empty state, loading list | Partial |
| 32 toast | Exists, but changes layout height |
| 33 non-interactive output | Exists, must not regress |

**The main finding:** only screens 1–11 are Ink. Screens 12–31 are plain
console and readline flows. Lots E and F are therefore a port, not a restyle.
`commands/first-run.ts` alone is over 700 lines, is covered by tests, and
handles credentials — rewriting it in Ink is the largest and riskiest item in
DA.md, and it is worth doing after Lots A–D have proven the design system.

## Verified gaps on the main screen

1. **No streaming display.** `stream` reaches the provider, but
   `application/reprompt.ts` awaits the full result. The user sees a spinner,
   then a block of text. Mockup screen 3 requires progressive text, a live
   cursor, elapsed time and a "Réception des tokens…" indicator.
2. **Single-line input.** `ink-text-input` cannot do multiline, history or safe
   paste. DA.md section 6 requires all three.
3. **No viewport.** The result renders as one `<Text wrap="wrap">`; long output
   overflows the terminal. DA.md sections 17 and 18 require scrolling.
4. **Modals replace the screen** instead of overlaying, losing context.
5. **The toast shifts the layout** — it is appended at the bottom and pushes
   content up. DA.md section 15 forbids this.
6. **Static status.** No live elapsed time or token counters during generation.
7. **No `<Static>`.** Everything re-renders each frame; DA.md section 22 warns
   against this, and it matters most during streaming.
8. **No structured errors.** DA.md section 13 requires title, message, cause and
   next action; today a raw string goes into a `Notice`.
9. **No focus manager.** DA.md section 8 requires a declared focus target per
   screen with restoration on modal close.

## Assumed divergences from the HTML

The mockup is a browser rendering. These parts are deliberately not ported, per
DA.md sections 21 and 25:

- **Background tints, shadows and glows** (`bg-rq-500/[.035]`, `shadow-glow`).
  DA.md section 21 forbids assuming a terminal background. Panel state is
  carried by border colour and title colour instead.
- **The window chrome** in the mockup — traffic-light dots and the `112 × 34`
  label — is mockup framing, not part of the TUI.
- **Rounded corners and pixel spacing** have no terminal equivalent; the border
  variants already in `theme` cover the intent.
- **`Ctrl+Shift+C` for copy** (mockup screen 4). Most terminal emulators consume
  this combination for their own copy action, so the application never receives
  it. The existing `Ctrl+Y` is kept and displayed instead.

## Resolved decisions

1. **Enter versus Ctrl+Enter.** The mockup advertises `Ctrl+Enter` to generate,
   and section 6 requires the input to accept newlines. Both cannot hold: nearly
   every terminal emulator sends the same byte (`CR`, `0x0D`) for Enter and
   Ctrl+Enter, with no modifier flag, so they are indistinguishable without the
   Kitty keyboard protocol or `modifyOtherKeys`. **Enter generates, and a
   trailing `\` before Enter inserts a newline.** The shortcut bar shows
   `Enter`, never `Ctrl+Enter`. The dead `Ctrl+\r` binding in `ui/shortcuts.ts`
   is removed rather than advertised.
2. **Accent colour: violet**, from the mockup. `docs/tui-design.md` was updated
   in the same change so a single specification remains.
3. **`Ctrl+C` cancels a running generation**, then quits when idle. This
   requires threading an `AbortController` from the UI through
   `application/reprompt.ts` into the provider adapters, which section 28 allows
   as necessary plumbing.
4. **Scope: Lots A to D first.** Lots E and F are a port, not a restyle, and are
   deferred until the design system is proven on the main screen.
5. **Baseline: "Shape the request. Keep the intent."**

## Control keys the terminal cannot deliver

`Ctrl+letter` is the letter's code minus 64, and four of those collide with
characters the terminal already assigns a meaning to. Ink resolves them before
it considers a control combination, so `key.ctrl` stays false and the binding
is indistinguishable from the plain key:

```text
Ctrl+H = 0x08 = Backspace
Ctrl+I = 0x09 = Tab
Ctrl+J = 0x0A = line feed
Ctrl+M = 0x0D = carriage return, i.e. Enter
```

DA.md section 7 lists `Ctrl+M` for the model picker, which therefore cannot
work: pressing it produced a plain Enter. The picker moved to **`Ctrl+O`**, for
the "o" of "mOdèle". `RESERVED_CTRL_KEYS` in `ui/shortcuts.ts` holds the four,
and a test asserts no binding and no advertised hint uses them.

`Ctrl+Enter`, covered above, is the same class of problem.

## Ctrl+C has to be claimed

Ink's `render` defaults to `exitOnCtrlC: true` and then never forwards Ctrl+C to
`useInput`. Any in-app handling of it is dead code until the option is turned
off, which is why the interrupt is rendered with `exitOnCtrlC: false`. Ctrl+C is
resolved before the modal check so it works from every state, as section 7
requires.

## The prompt has to be pinned back

`ink-text-input` filters only the arrows, `Ctrl+C` and `Tab`; every other
control combination has its letter inserted into the value. Ink dispatches the
field's handler before the app's, so a shortcut would leave its letter in the
prompt. Every control-triggered intent therefore carries `preserveInput: true`,
and the app restores the pre-keystroke value. This is load-bearing, not
cosmetic, and a test enumerates the bound keys to keep it that way.

## Naming

DA.md section 4 lists PascalCase component files. The project uses kebab-case
(`app-frame.tsx`), and section 4 also says to adapt to the existing structure
rather than create a parallel one. Kebab-case is kept.
