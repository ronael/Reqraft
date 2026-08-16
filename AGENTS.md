# Project Notes For Agents

## UI

- The interactive CLI uses OpenTUI through `src/opentui/`.
- Keep product state, shortcuts, provider/model selection and formatting rules in
  the shared `src/ui/` modules when possible.
- Do not introduce a component registry without an explicit product decision.
- Prefer existing OpenTUI wrappers such as `ScrollView` and `TextViewport`
  before adding a custom terminal primitive.
- Non-interactive commands stay in `src/commands/` and must keep clean
  stdout/stderr behavior.
- `pnpm snapshot:tui` (Bun required — OpenTUI's test renderer has no Node FFI
  build) drives the real TUI at the keyboard against the `mock` provider and
  writes cell-exact captures of each screen to `docs/design/snapshots/`
  (HTML to look at, `.txt` frames to diff). Use it to check a UI change instead
  of describing it.

## Desktop (Electron)

- The desktop app lives in `src/desktop/` (`main/`, `preload/`, `renderer/`,
  `shared/`) and shares the engine through direct source imports — never
  duplicate business logic there.
- The renderer never imports `src/core/`, `src/providers/`, `src/auth/` or
  `src/application/`; everything goes through the IPC contract, defined in
  the single file `src/desktop/shared/ipc-channels.ts`. New channels are
  added there only, with a Zod schema in `ipc-contract.ts`.
- Feature parity across CLI/TUI/desktop is enforced by the capability
  registry in `src/capabilities/` and its drift tests.
- Reference doc: `docs/internal/DESKTOP.md`; work journal:
  `docs/internal/WORKLOG.md` (both git-ignored, local).
