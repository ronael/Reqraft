# Internationalisation feasibility

## Recommendation

Reqraft can support English without converting the whole product to English or
translating generated prompts to the interface language. Two independent
settings are required:

- **UI locale** controls commands, help, onboarding, errors, quality notices,
  statistics and TUI labels.
- **Output language** controls the rewritten prompt. Its default remains
  `auto`, meaning that Reqraft preserves the language of the input.

An English UI must therefore still return French for a French input, and a
French UI must return English for an English input. Machine-readable JSON keys,
provider ids, model ids, profile ids and exit codes must never be translated.

## Current state

- The common profile rules already tell the model to preserve the input
  language.
- `EngineOptions.language` and `PromptBuildInput.language` already support an
  explicit output-language instruction.
- That option is not currently exposed by the CLI, TUI or configuration.
- Product copy is embedded across command, OpenTUI, formatter, error, provider
  and profile modules. It has no shared locale resolver or message catalogue.
- Internal generation instructions and profile guidance are written in French.
  Rewriting those instructions is model behaviour work, not UI translation,
  and could affect latency and the validated fidelity benchmark.
- The main README is English and a French README already exists under
  `docs/fr/`, so documentation has begun this separation informally.

## Proposed architecture

Introduce a small typed i18n boundary rather than a general-purpose framework:

```text
src/i18n/
  locale.ts          # UiLocale, precedence and normalization
  translate.ts       # typed key lookup and interpolation
  messages/
    en.ts            # canonical catalogue
    fr.ts            # complete French catalogue
```

Locale precedence should be deterministic:

1. `--ui-language <en|fr>` for the current invocation;
2. `uiLanguage` in `config.json`;
3. `REQRAFT_LANG`;
4. `LC_ALL`, `LC_MESSAGES` or `LANG`;
5. English fallback for an international CLI.

The config schema can add `uiLanguage: "auto" | "en" | "fr"` without breaking
existing files because defaults are applied during parsing. Translation
functions should receive the resolved locale explicitly at application/UI
boundaries; provider adapters and core fidelity rules must not depend on the UI
locale.

Keep output language separate as `outputLanguage: "auto" | string`. The
existing engine `language` field can carry the resolved override. With `auto`,
no local language detector is required: the model receives the existing strict
instruction to preserve the input language. An optional `--output-language`
flag can force a language for translation-oriented use cases later.

## Migration slices

### 1. Infrastructure and CLI help

- Add locale resolution, typed catalogues and interpolation tests.
- Add `uiLanguage` to configuration and `--ui-language` to the root command.
- Translate Commander descriptions, validation errors and non-interactive
  command output.
- Keep JSON output stable and locale-independent.

### 2. Init and authentication

- Move first-run, credential and doctor messages to the catalogues.
- Let `rp init` choose a language explicitly when OS locale detection is
  ambiguous.
- Test both locale snapshots with colour enabled and disabled.

### 3. OpenTUI

- Translate headings, empty/loading/error states, quality notices, modal
  choices and shortcut labels.
- Verify narrow terminals because English and French labels have different
  lengths.

### 4. Generated-output contract

- Add English and mixed-language cases to the existing fidelity dataset.
- Assert English input produces English output and French input remains French
  under both UI locales.
- Expose `--output-language` only after those regressions pass.
- Do not translate or rewrite the validated internal system prompts merely to
  make the UI English. Treat any such change as a separate benchmarked engine
  iteration.

## Main risks

- Conflating UI and output languages could unexpectedly translate user input.
- Translating profile names or ids could break scripts and saved configs.
- Localising provider errors requires preserving actionable API details while
  translating only Reqraft's wrapper message.
- TUI copy expansion can reintroduce wrapping and footer overflow.
- Model-generated warnings may not match the UI locale unless their language is
  explicitly included in the output contract.
- A partially migrated CLI feels less professional than a deliberate French
  beta, so English should ship only when the root help, init, auth, doctor,
  quick output and OpenTUI are complete together.

## Feasibility decision

The migration is feasible and does not require changing providers or the core
result schema. It is a medium-sized product refactor, not a string-replacement
task. The safest first deliverable is English and French UI catalogues plus a
multilingual regression dataset, while preserving input language by default.
Additional locales can then be added without touching provider adapters or
business rules.
