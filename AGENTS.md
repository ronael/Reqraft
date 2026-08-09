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
