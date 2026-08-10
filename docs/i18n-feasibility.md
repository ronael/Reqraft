# Internationalisation architecture specification

## Status and decision

This document is the source of truth for the first Reqraft internationalisation
implementation. It replaces the previous feasibility note, which correctly
separated interface locale from generated-output language but did not audit the
machine-readable and core contracts deeply enough.

The migration is feasible, but it is not a string-replacement task. The current
core exposes French human-readable text through quality signals, warnings,
fallback parser results and errors. Translating only command and TUI labels
would leave the business model coupled to French and would make `--json` vary
with presentation decisions.

The implementation must therefore stabilise structured contracts before
introducing translation catalogues. The first complete multilingual release
should be versioned as `0.2.0`, because the `--json` contract described below is
intentionally incompatible with the unversioned `0.1.x` result shape.

## Goals

- Support English and French across the public CLI and interactive terminal UI.
- Keep UI locale and generated-output language fully independent.
- Preserve the input language by default.
- Remove user-facing localised text from core and provider contracts wherever a
  stable code and parameters can represent the same information.
- Make JSON output versioned, scriptable and independent of `uiLocale`.
- Make catalogue keys and parameters type-safe and detect missing translations
  at build time.
- Keep the i18n runtime small, synchronous and reusable by a future desktop UI.
- Preserve existing provider, model, profile, level and exit-code identifiers.
- Preserve existing configuration files without requiring a manual migration.

## Non-goals

- Translating or otherwise rewriting internal LLM instructions, profile
  instructions, `BASE_SYSTEM_PROMPT` or prompt-engineering policy.
- Changing provider payloads, model parameters, fidelity thresholds or output
  token policy.
- Detecting the actual natural language of generated text locally.
- Translating user input, generated prompts, model-generated changes or raw
  model warnings as part of UI localisation.
- Localising provider and model brand names or technical identifiers.
- Adding locales beyond English and French in the first implementation.
- Introducing a general-purpose framework such as i18next unless requirements
  emerge that the typed local catalogue cannot satisfy.
- Migrating documentation, benchmark reports or custom profile content as part
  of the runtime UI migration.

## Terminology

Use these names consistently in code, config, CLI options and documentation:

```ts
type UiLocale = "en" | "fr";
type UiLocalePreference = "auto" | UiLocale;
type OutputLanguage = "auto" | string;
```

- `uiLocale` controls Reqraft-owned presentation copy: help, prompts, errors,
  status labels, quality explanations, statistics and TUI controls.
- `outputLanguage` controls the language requested from the LLM. `auto` means
  preserve the input language.

Do not use `language`, `locale`, `lang` or `uiLanguage` for these settings in
new public contracts. The existing internal `EngineOptions.language` and
`PromptBuildInput.language` fields may be renamed to `outputLanguage` when that
feature is exposed, but not during the UI-only portion of the migration.

## Architecture invariants

1. `src/core`, provider adapters and reusable application use cases must not
   depend on `uiLocale`, translation catalogues or presentation formatters.
2. Core diagnostics and errors use stable codes, typed parameters and optional
   raw details. They do not carry translated user messages.
3. Presentation layers translate codes as late as possible.
4. `uiLocale` never changes `original`, `rewritten`, model-generated `changes`
   or model-generated warning details.
5. `outputLanguage` never changes CLI help, status messages or error copy.
6. Technical ids, JSON keys, schema versions, exit codes and enum values are
   stable and never translated.
7. Provider and model API details remain owned by provider adapters.
8. Internal LLM instructions remain French in this project phase. Changing
   them is engine behaviour work and requires the fidelity benchmark.
9. Regular JSON output never includes ANSI escapes, translated UI messages,
   stack traces, raw HTTP bodies, secrets or arbitrary `Error.message` values.
10. A localised surface may format a structured result but must not alter it.

## Text classification

Every string encountered during migration belongs to one of three categories.

### 1. UI copy

Reqraft-owned text shown to a human. It must be addressed through the typed
catalogue.

Representative current locations:

- `src/cli.tsx`: Commander descriptions, arguments, options and top-level error.
- `src/commands/reprompt.ts`: input errors, secret policy, stats, quality,
  explain and clipboard confirmation.
- `src/commands/first-run.ts`: all init questions, menus, summaries and status.
- `src/commands/auth.ts`, `src/auth/credentials.ts`: auth actions, prompts,
  credential-source labels and secure-storage errors.
- `src/commands/doctor.ts`, `config.ts`, `aliases.ts`, `list.ts`: headings,
  labels, usage and success/error output.
- `src/ui/errors.ts`, `formatters.ts`, `result-view.ts`, `view-labels.ts`,
  `modal-options.ts`, `shortcut-hints.ts`, `header-status.ts`.
- `src/ui/components/**/*.tsx` and `src/opentui/**/*.tsx`: labels, empty states,
  loading states, modal titles, quality notices, toasts and shortcut actions.
- `src/models/presets.ts`: model descriptions, but not model ids or names.
- Built-in profile display names and descriptions. Profile ids, aliases and LLM
  instructions are not UI copy.

### 2. Machine-readable contract

Stable data consumed by scripts, tests, benchmarks or future APIs. It must not
be translated according to `uiLocale`.

Representative current locations:

- `RepromptResult`, `QualityAssessment`, `QualitySignal`, `ProviderHealth` and
  provider/core errors in `src/core/types.ts`.
- `--json` serialization in `src/commands/reprompt.ts`.
- Config JSON in `src/config/schema.ts`, `loader.ts` and `commands/config.ts`.
- Provider, profile, model, level and fidelity ids.
- `EXIT_CODES` and quality status/severity values.
- Benchmark JSON emitted by `benchmark/runner.ts` and
  `benchmark/fidelity-runner.ts`.
- Streaming protocol fragments and provider payloads.

Human-originated or model-originated strings can exist inside a machine
contract when their semantics require it. `original`, `rewritten`, `changes`
and a raw model warning detail are examples. They are content, not translated UI
copy, and their language follows `outputLanguage` or the provider response.

### 3. LLM instructions and prompt engineering

Text sent to models to control reprompting. It is explicitly outside UI i18n.

Representative current locations:

- `src/core/prompt-builder.ts`.
- `src/profiles/base.ts`, built-in profile `instructions` and
  level-aware profile guidance.
- `src/core/levels.ts` descriptions used in the system prompt.
- The connection-check prompt in `src/commands/first-run.ts`.
- Benchmark prompts and expected fidelity rules.

Profile `name` and `description` currently coexist with `instructions` in each
profile object. The migration must separate presentation metadata from the LLM
instruction payload logically, even if the profile files remain physically
unchanged at first.

## Verified current-state audit

### `RepromptResult`

The current result contains:

| Field                                   | Current semantics                            | Problem                                | Target decision                           |
| --------------------------------------- | -------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| `original`                              | User input                                   | None for i18n                          | Keep unchanged                            |
| `rewritten`                             | Model output                                 | None for UI i18n                       | Keep; follows output language             |
| `profile`, `level`, `provider`, `model` | Stable ids                                   | None                                   | Keep untranslated                         |
| `changes: string[]`                     | Usually model-generated explanations         | Content language is not guaranteed     | Keep as model content; never UI-translate |
| `warnings: string[]`                    | Flattened non-info quality messages          | Mixes model text with core French text | Remove in the new result contract         |
| `quality.status`                        | Stable enum                                  | None                                   | Keep                                      |
| `quality.signals[].code`                | Stable enum                                  | Good foundation                        | Keep and expand as discriminated union    |
| `quality.signals[].severity`            | Stable enum                                  | None                                   | Keep                                      |
| `quality.signals[].message`             | French or model text                         | Couples core and JSON to human text    | Remove                                    |
| `quality.signals[].details`             | French display labels for detected additions | Not stable or typed                    | Replace with typed `params`               |
| `usage`, `latencyMs`                    | Numeric metrics                              | UI formatting is currently French      | Keep numeric; localise only presentation  |

### `warnings` and parser fallback

The model response schema requests `warnings: string[]`. Those strings are
model-generated content and may legitimately be in the output language. The
engine currently converts each to a `model_warning` signal, then recreates
`RepromptResult.warnings` by flattening every non-info signal message. This
causes core-generated French warnings and model-generated warnings to become
indistinguishable.

`src/core/result-parser.ts` also invents French `changes` and `warnings` when a
provider returns unstructured output. The target behaviour is:

- keep `changes` empty on parser fallback;
- emit an `unstructured_response` structured diagnostic;
- preserve each model warning only as the raw `detail` of a `model_warning`
  diagnostic;
- remove the top-level `warnings` field from the new result contract;
- render human warnings from diagnostic codes in presentation layers.

The LLM response schema still uses the key `warnings`. That key is part of the
LLM protocol and remains unchanged in this migration.

### Quality and fidelity

`src/core/fidelity.ts` currently returns French messages and French display
labels such as `témoignages` or `base de données`. The detection patterns are
valid multilingual business rules and can stay in core, but their outputs must
be stable term ids:

```ts
type UnsupportedAddition =
  | "testimonials"
  | "faq"
  | "cta"
  | "pricing"
  | "footer"
  | "header"
  | "responsive"
  | "seo"
  | "animations"
  | "authentication"
  | "database"
  | "color_palette"
  | "performance";
```

The French and English lexical patterns remain implementation details of the
detector. Catalogues translate the stable ids only when displaying them.

### Provider health and errors

`ProviderHealth` currently requires `message: string`; adapters return mixed
French and English messages. `doctor` already ignores this message and uses
`ok` plus `missingConfiguration`, so `message` can be removed. Target shape:

```ts
interface ProviderHealth {
  ok: boolean;
  code?: "missing_configuration" | "unreachable" | "invalid_configuration";
  missingConfiguration?: string[];
  detail?: string;
}
```

`ProviderError`, network wrappers and stream parsers currently encode user copy
inside `Error.message`. HTTP errors can also include a truncated raw response
body. Errors must become structured as described below. Raw provider bodies are
debug data and must never be exposed by default because they may echo prompts
or credentials.

### Core and validation errors

French human messages currently originate in:

- `RequestCancelledError`, `RequestTimeoutError` and
  `EmptyProviderResponseError`;
- level/profile/provider resolution;
- config loading and config value parsing;
- input file and clipboard wrappers;
- credential validation and OS secure-storage operations;
- OpenTUI launcher/bootstrap wrappers;
- Zod's own issue messages when they escape through a generic catch.

Presentation code often displays `error.message` directly. This pattern must be
removed. External Node, filesystem, clipboard, HTTP and Zod errors remain
causes or debug details; they are mapped to stable Reqraft error codes before
crossing into a presentation surface.

### Commander

Commander descriptions are currently French while Commander's own parser
errors can remain English. Locale resolution must occur before the `Command`
tree is built. Known `CommanderError.code` values must be mapped to catalogue
messages; presentation must not parse Commander's English message text.

### Interactive and command surfaces

- `rp init` is entirely human-facing except when it prints existing config JSON.
- `auth`, `doctor` and aliases are human-facing today.
- `rp config get` without a key prints machine-readable config JSON and must not
  translate keys or enum values. Config command errors and headings are UI copy.
- Provider/profile/model list ids and names are stable. Descriptions and helper
  labels are UI copy.
- OpenTUI and the legacy Ink surface contain direct strings in components,
  selectors, view-label helpers, formatters and shortcut definitions.
- Streaming partial text is model content and must not be translated. Loading,
  elapsed-time and receiving labels are UI copy.

## Target diagnostics and error design

### Quality diagnostics

Use a discriminated union with no `message` property:

```ts
type QualitySignal =
  | {
      code: "unsupported_additions";
      severity: "info" | "warning";
      params: { additions: UnsupportedAddition[] };
    }
  | {
      code: "disproportionate_expansion";
      severity: "info" | "warning";
    }
  | {
      code: "output_truncated";
      severity: "critical";
    }
  | {
      code: "unstructured_response";
      severity: "warning";
    }
  | {
      code: "model_warning";
      severity: "warning";
      detail: string;
    };
```

`detail` is allowed only when the information cannot be represented by a
Reqraft-owned code and parameters. It is raw, unlocalised content. It must not
be used as a translation key, interpolated into unrelated messages or assumed
to match `uiLocale`.

The presentation mapping is exhaustive:

```ts
t(locale, "quality.outputTruncated");
t(locale, "quality.unsupportedAdditions", {
  additions: signal.params.additions.map((id) => t(locale, `addition.${id}`)),
});
```

### Structured errors

Introduce a stable error descriptor shared by core/application boundaries:

```ts
type ReqraftErrorCode =
  | "request.cancelled"
  | "request.timeout"
  | "result.empty"
  | "result.unparseable"
  | "input.missing"
  | "input.file_unreadable"
  | "clipboard.read_failed"
  | "clipboard.write_failed"
  | "config.invalid"
  | "config.value_invalid"
  | "profile.unknown"
  | "level.invalid"
  | "provider.unsupported"
  | "provider.missing_configuration"
  | "provider.authentication_failed"
  | "provider.insufficient_credit"
  | "provider.rate_limited"
  | "provider.unavailable"
  | "provider.request_failed"
  | "credential.placeholder"
  | "credential.storage_unavailable";

interface ReqraftErrorDescriptor {
  code: ReqraftErrorCode;
  params?: Record<string, string | number | string[]>;
  exitCode: number;
  detail?: string;
}
```

The concrete error class may extend `Error` for stack/cause semantics, but:

- its stable property is named `errorCode`, avoiding confusion with the numeric
  CLI exit code;
- `Error.message` is not a user contract and must never be displayed directly;
- `cause` remains internal;
- `detail` is sanitised and bounded at its infrastructure boundary;
- provider response bodies are omitted from normal JSON and normal UI output;
- `--verbose` may print a safe technical detail to stderr, never secrets,
  headers, keys or the complete provider body.

Use specific typed parameter objects for known codes during implementation.
The broad `Record` above describes the serialisable boundary, not the preferred
authoring type. Presentation translation must be exhaustive over error codes.

### Zod and external errors

- Convert Zod issues to `config.invalid` or `config.value_invalid` with stable
  path/code parameters. Do not expose Zod's locale-dependent default messages
  in normal UI or JSON.
- Map Node/FS errors using operation and path parameters. Keep `errno`, `code`
  and safe cause text as debug detail only.
- Map clipboard failures by operation; do not display clipboardy's raw message
  by default.
- Map HTTP status and provider id structurally. Preserve status as a number.
- Map unknown exceptions to `internal.unexpected` before presentation. This code
  must be added to the final union and use the existing general exit code.

## JSON contract

### Current contract

`rp ... --json` currently serialises `RepromptResult` directly with no schema
version or success/error envelope. On failure it emits localised text to stderr
and no JSON error object. French text can currently appear in:

- `warnings[]` from core-generated quality messages;
- `quality.signals[].message`;
- `quality.signals[].details` labels;
- parser-fallback `changes[]` and `warnings[]`;
- model-generated `changes[]` and warnings, whose language is output content.

Changing `uiLocale` must not silently change a script's JSON output. Keeping the
old shape while adding translated strings would violate this rule.

### Target contract

Ship a versioned envelope in `0.2.0`:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "result": {
    "original": "fix the login page",
    "rewritten": "Fix the login page while preserving the existing implementation.",
    "profile": "frontend",
    "level": "standard",
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "changes": ["Clarified the requested scope."],
    "quality": {
      "status": "review",
      "signals": [
        {
          "code": "disproportionate_expansion",
          "severity": "warning"
        }
      ]
    },
    "usage": {
      "inputTokens": 120,
      "outputTokens": 40,
      "visibleOutputTokens": 40
    },
    "latencyMs": 850
  }
}
```

Failure uses the same versioned envelope and a non-zero process exit code:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "error": {
    "code": "provider.rate_limited",
    "params": {
      "provider": "openai",
      "httpStatus": 429
    },
    "exitCode": 4
  }
}
```

Contract rules:

- `warnings` is removed. Consumers use `quality.signals`.
- `message` and display labels are absent from diagnostics and errors.
- `changes` remains because it is model-generated explanatory content. Its
  language follows generated output, not `uiLocale`.
- A `model_warning` signal may contain raw `detail`; this is model output and
  may follow `outputLanguage`.
- Undefined optional metrics remain omitted. Numeric values and currency codes
  remain locale-neutral.
- `--json` writes exactly one JSON document to stdout. Non-verbose operational
  logs must not contaminate stdout. Human debug output, if requested, goes to
  stderr.
- ANSI is always disabled for JSON.
- The same mocked result/error serialises byte-for-byte identically under `en`
  and `fr` UI locales.

### Compatibility strategy

- Announce the new envelope and removal of `warnings` in the `0.2.0` changelog.
- Add `schemaVersion: 1` from the first new contract release.
- Do not maintain two implicit JSON shapes or make JSON depend on UI locale.
- Because Reqraft is currently `0.x` alpha, prefer one explicit `0.2.0` break
  over a permanent legacy serializer. Users requiring the old shape can pin
  `0.1.x`.
- Add fixture-based contract tests before changing implementation.
- Benchmark report formats are separate internal artefacts. Version them or
  update readers in the same commit, but do not conflate them with CLI JSON.
- Existing config files remain valid through schema defaults and passthrough.

## Proposed i18n architecture

The existing architecture supports a small framework-independent module:

```text
src/i18n/
  locale.ts          # preference parsing, system detection and resolution
  translate.ts       # typed Translator and parameter contracts
  messages/
    en.ts            # complete English catalogue
    fr.ts            # complete French catalogue
```

No React or terminal dependency belongs in this module. `src/core`,
`src/providers` and reusable application use cases must be prevented from
importing it through ESLint boundaries or an architecture test.

### Typed catalogues

Use functions rather than a loosely typed interpolation language:

```ts
interface MessageParameters {
  "quality.outputTruncated": undefined;
  "quality.unsupportedAdditions": { additions: string };
  "provider.requestFailed": { provider: string; httpStatus?: number };
  "request.timeout": { timeoutMs: number };
}

type MessageCatalogue = {
  [Key in keyof MessageParameters]: MessageParameters[Key] extends undefined
    ? () => string
    : (params: MessageParameters[Key]) => string;
};
```

Both `en` and `fr` must satisfy the complete `MessageCatalogue`. `t` must infer
whether parameters are required from the selected key. Missing keys, unknown
keys and invalid parameters must fail TypeScript.

Namespaced flat keys are preferred (`quality.outputTruncated`,
`provider.requestFailed`, `init.providerQuestion`) because they are easy to
search and do not require runtime path traversal.

Plural support is not needed initially. If a real message requires it, use
`Intl.PluralRules` inside that catalogue function rather than introducing a
framework. Human number formatting may use `Intl.NumberFormat(uiLocale)`;
machine JSON always retains raw numbers.

### Translator ownership

- Resolve `uiLocale` once during CLI bootstrap.
- Construct one immutable `Translator` and pass it explicitly to command and UI
  presentation boundaries.
- Do not read `process.env` or global locale state inside arbitrary formatters.
- OpenTUI may expose the translator through its renderer context, but pure view
  helpers should still receive it or the locale explicitly.
- `src/auth/credentials.ts` currently mixes storage operations with prompting
  and display. Separate credential operations into structured results/errors;
  keep prompts and copy in the command/presentation boundary.
- Custom profile names/descriptions are user-authored content and are displayed
  unchanged. Built-in profile display metadata comes from the catalogue.

### Preventing untranslated copy

Type safety guarantees catalogue completeness but cannot by itself detect every
new literal. Add these enforcement mechanisms:

- an architecture test forbidding imports from `src/i18n` inside core,
  providers and locale-independent application modules;
- a source inventory test or lint rule covering user-visible literals in
  `commands`, `ui`, `opentui`, `cli.tsx` and auth presentation code, with a
  small reviewed allowlist for technical literals;
- review guidance requiring one of the three text classifications for new
  public strings;
- tests that exercise every public surface in both locales;
- no blanket ESLint disables or broad path exclusions.

## Locale resolution and normalisation

### Sources and precedence

Resolve `uiLocale` deterministically in this order:

1. explicit root option `--ui-locale <auto|en|fr>`;
2. config `uiLocale`;
3. environment variable `REQRAFT_UI_LOCALE`;
4. system locale;
5. English fallback.

`auto` means continue to the next source. An unsupported explicit CLI, config
or Reqraft environment value is a validation error. An unsupported system
locale falls back to English.

Locale bootstrap happens before Commander builds help text:

1. perform a minimal, side-effect-free scan of raw `process.argv` for
   `--ui-locale value` and `--ui-locale=value`;
2. load config if possible;
3. if config loading fails, resolve locale from CLI/env/system so the config
   error itself can be localised;
4. build the Commander tree with the resolved translator;
5. let Commander perform authoritative argument validation.

The preliminary scan must not consume arguments or become a second general CLI
parser.

### System locale sources

For Unix-like systems, inspect in order:

1. `LC_ALL`;
2. `LC_MESSAGES`;
3. `LANG`;
4. `Intl.DateTimeFormat().resolvedOptions().locale`.

macOS terminal sessions normally expose `LANG`, but `Intl` is the fallback for
GUI launches. Windows often lacks the POSIX variables, so `Intl` is the primary
effective system source there. Do not infer UI language from `SHELL`, terminal
encoding, timezone or keyboard layout.

### Normalisation algorithm

For system locale values:

1. trim whitespace;
2. treat empty, `C` and `POSIX` case-insensitively as no supported locale;
3. remove an encoding suffix after `.`, such as `.UTF-8`;
4. remove a modifier after `@`, such as `@euro`;
5. replace `_` with `-`;
6. use `Intl.getCanonicalLocales` when it accepts the result;
7. inspect the canonical primary language subtag;
8. map `fr-*` to `fr` and `en-*` to `en`;
9. fall back to English for every other system language.

Required examples:

| Input           | Resolved locale                                             |
| --------------- | ----------------------------------------------------------- |
| `fr`            | `fr`                                                        |
| `fr_FR.UTF-8`   | `fr`                                                        |
| `fr-FR`         | `fr`                                                        |
| `fr_CA@euro`    | `fr`                                                        |
| `en_US`         | `en`                                                        |
| `en_US.UTF-8`   | `en`                                                        |
| `en-GB`         | `en`                                                        |
| `C`             | fallback `en`                                               |
| `POSIX`         | fallback `en`                                               |
| `de_DE.UTF-8`   | fallback `en`                                               |
| malformed input | fallback `en` for system; error for explicit Reqraft source |

## Configuration design

Add these config defaults only when their implementation phase begins:

```json
{
  "uiLocale": "auto",
  "outputLanguage": "auto"
}
```

- Add both keys to `ConfigSchema` and `CONFIG_KEYS`.
- Existing configs remain valid and receive defaults.
- `ConfigSchema.passthrough()` continues to preserve forward compatibility.
- `rp config get` prints stable key names and enum values, never translated
  keys.
- `rp config set uiLocale fr` validates strictly.
- `outputLanguage` accepts `auto` or a non-empty BCP 47-like/string value, but
  it is not exposed until the final optional phase.
- Never derive `outputLanguage` from `uiLocale`.

## Surface-by-surface decisions

### Non-interactive reprompt command

- Plain rewritten output remains unchanged on stdout.
- Diff markers remain technical; headings and explain/quality labels localise.
- Stats labels and unavailable-value text localise; numeric data remains raw
  internally.
- Secret detection messages localise; secret types remain stable ids.
- Clipboard confirmation localises.
- `--verbose` localises Reqraft-owned labels but preserves safe technical detail.
- `--json` follows the versioned locale-neutral contract above.

### Commander

- Translate root/subcommand descriptions, argument descriptions and option help.
- Keep command names, option flags and enum values stable.
- Map known Commander error codes instead of displaying raw parser text.
- Test complete `--help` output in `en` and `fr`.

### Init

- Translate every question, choice description, validation message, summary
  label and shell instruction explanation.
- Keep commands, paths, environment-variable names and config values unchanged.
- The language choice is controlled by the root locale resolver; do not add an
  init-only locale state.
- Existing config JSON display remains machine-readable and untranslated.

### Auth

- Credential source becomes an enum such as `environment`, `secure_storage`,
  `not_configured`, `invalid_placeholder`.
- Secure-storage operations return structured success/errors.
- Prompts, headings and remediation copy move to the presentation boundary.
- Provider ids and environment names remain unchanged.

### Doctor

- `ProviderHealth.message` is removed.
- Doctor translates headings and health-code labels.
- Missing configuration names remain technical values.
- Provider brand labels remain unchanged.

### Config

- Config JSON, keys and values are never translated.
- Usage, validation and unknown-key/action errors are translated.
- Zod issues are mapped structurally rather than concatenated from
  `error.message`.

### Aliases

- Actions and shell syntax remain stable.
- Prompts, confirmation, status and errors localise.
- Shell names, file paths and generated shell content remain unchanged.

### OpenTUI and `src/ui`

- Translate all state labels, panel titles, placeholders, notices, modal items,
  shortcut action labels, stats and errors.
- Shortcut key combinations remain unchanged.
- Pure components receive already translated strings where practical; they do
  not read global locale.
- Responsive layout is tested independently for English and French at narrow,
  regular and wide widths.
- Model streaming content and diff payloads are never translated.
- The legacy Ink surface must either be migrated in the same release or removed
  from supported runtime code. Leaving a reachable French fallback is not an
  acceptable complete migration.

### Provider/model/profile catalogues

- Provider ids and brand labels remain stable.
- Model ids and official names remain stable; model descriptions localise.
- Built-in profile ids and aliases remain stable. Built-in display name and
  description localise. LLM instructions remain unchanged.
- Custom profile names, descriptions and instructions remain user content and
  are never automatically translated.
- Level ids remain `minimal`, `standard`, `complete`; UI labels may localise.

## Migration sequence

The implementation should use the following order. Each phase must leave tests
green and must not start bulk copy migration before its contracts are stable.

### Phase 0: Characterisation and inventory

- Freeze current `0.1.x` JSON fixtures, exit codes and major command outputs.
- Complete a classified inventory of current user-visible literals.
- Add tests demonstrating current French leakage in quality/parser JSON; these
  tests become target migration tests, not permanent expected behaviour.

### Phase 1: Structured core contracts

- Replace `QualitySignal.message/details` with the discriminated union.
- Return stable unsupported-addition ids.
- Remove synthetic French parser fallback changes/warnings.
- Remove `ProviderHealth.message`.
- Introduce structured core/provider/config/input/clipboard errors.
- Keep presentation temporarily French by mapping codes in one temporary
  presenter, so behaviour remains usable while core changes.

### Phase 2: Versioned JSON contract

- Define and test success/error envelope schemas.
- Remove top-level `warnings` from the new result.
- Update CLI serialization, E2E tests and benchmark consumers.
- Assert locale-neutral output before any catalogues exist.

### Phase 3: Locale infrastructure

- Implement normalisation, resolution and typed catalogues.
- Add `uiLocale` config/env/CLI plumbing.
- Add architecture enforcement preventing core-to-i18n imports.
- Choose English as fallback and canonical catalogue; require complete French.

### Phase 4: CLI bootstrap and non-interactive surfaces

- Resolve locale before Commander construction.
- Migrate Commander and `commands/reprompt.ts`.
- Migrate common error presentation and formatters.
- Preserve stdout/stderr and ANSI contracts.

### Phase 5: Operational commands

- Migrate init, auth/credentials, doctor, config, aliases and list commands.
- Refactor auth/provider health boundaries where structured data is required.

### Phase 6: Interactive UI

- Migrate `src/ui`, OpenTUI and any reachable legacy Ink surface.
- Test TUI focus, streaming, footer, scrolling and narrow layouts in both
  locales.

### Phase 7: Multilingual regression suite

- Complete all locale, CLI, JSON, TUI and cross-language tests listed below.
- Run existing fidelity tests and real provider benchmarks where authorised.
- Confirm internal LLM prompts have not changed.

### Phase 8: Optional output-language exposure

- Rename internal `language` fields to `outputLanguage`.
- Add `--output-language` and config support only after preservation tests pass.
- Keep default `auto` and never derive it from `uiLocale`.

This order improves on the previous audit by placing structured contracts and
JSON before locale catalogues and bulk UI string movement.

## Test strategy

### Locale resolver

- Precedence tests for CLI, config, `REQRAFT_UI_LOCALE`, system and fallback.
- `auto` continuation at every explicit source.
- Strict rejection for unsupported explicit values.
- Table tests for `fr_FR.UTF-8`, `fr-FR`, `fr_CA@euro`, `en_US.UTF-8`,
  `en_US`, `en-GB`, `C`, `POSIX`, unsupported and malformed values.
- Windows tests with no POSIX env and mocked `Intl` locale.
- macOS/Linux tests for each `LC_*` precedence case.

### Catalogues and translation

- Compile-time exhaustive `en` and `fr` catalogues.
- Runtime tests for no-param and parameterised keys.
- Escaping and interpolation of provider ids, paths and dynamic values.
- Explicit fallback behaviour for impossible runtime catalogue corruption.
- Number/duration formatting in both locales.
- No plural engine until a real pluralised key exists.

### Structured contracts

- Every quality code and severity/params combination.
- Model warning raw detail preserved without UI translation.
- Parser fallback emits only structured `unstructured_response`.
- Provider HTTP/network/auth/rate-limit/error mappings.
- Timeout, cancellation, empty response, config, Zod, FS and clipboard errors.
- No core diagnostic/error exposes a presentation `message` field.
- Architecture test proving core/providers do not import i18n.

### JSON

- Fixture tests for success and every error family.
- `schemaVersion`, `ok`, stable ids and numeric exit code.
- Byte-identical mocked JSON under `uiLocale=en` and `uiLocale=fr`.
- No ANSI, stack, raw HTTP body, provider key or localised message.
- Model-generated `rewritten`, `changes` and warning `detail` preserved exactly.
- stdout contains one JSON document; stderr rules are explicit.
- Config JSON remains stable under both locales.

### CLI and operational commands

- Root and subcommand `--help` in English and French.
- Commander parse errors in both locales.
- Missing input, secret detection, stats, quality, explain and clipboard output.
- Init complete/cancel/error paths with ANSI on/off and Unicode/ASCII.
- Auth login/logout/status, doctor, config and aliases in both locales.
- Provider/model/profile list output with stable ids.

### OpenTUI

- Empty, loading, streaming, success, warning and error states in both locales.
- Modal titles/options, shortcut bar, toast and clipboard feedback.
- ANSI/colour capabilities remain independent of locale.
- Narrow, regular and wide terminals; long English and French strings cannot
  hide the footer or overflow panels.
- Paste, Ctrl+C, focus, scrolling and resize regressions remain covered.

### Output-language separation

- French prompt with English UI produces French rewritten content.
- English prompt with French UI produces English rewritten content.
- Mixed-language input preserves technical terms and does not force UI locale.
- Explicit output language, once exposed, overrides preservation without
  changing UI copy.
- Existing fidelity dataset stays green.
- Add multilingual benchmark fixtures before running paid provider checks.
- Any internal prompt change fails a snapshot/contract test and requires a
  separate benchmarked change.

## Risks and mitigations

- **Silent JSON breakage:** release as `0.2.0`, version the envelope and publish
  migration notes.
- **UI/output language coupling:** use separate types, config keys and tests;
  never pass `uiLocale` to core rewrite functions.
- **Model warning ambiguity:** mark it as raw `detail`, not translated UI copy.
- **Provider data leakage:** structure HTTP errors and exclude raw body/detail
  from normal UI and JSON.
- **Zod/Commander/Node messages bypassing catalogues:** map by stable codes and
  never display arbitrary `Error.message` directly.
- **Partial migration:** do not advertise English until every public command
  and reachable interactive renderer is complete.
- **Layout regressions:** render both locales at constrained widths and keep
  footer/scroll tests.
- **Dynamic string construction:** move complete sentences into catalogue
  functions; pass typed parameters rather than concatenating translated
  fragments.
- **Translated technical ids:** keep display labels separate from stored values.
- **Custom profiles:** treat their metadata and instructions as user content.
- **Benchmark drift:** leave LLM instructions untouched and run fidelity tests.
- **Desktop duplication:** keep locale/translator framework-independent and
  presentation mappings reusable outside terminal renderers.

## Files likely affected

This list is expected implementation scope, grouped by responsibility. It is
not permission to translate LLM instructions.

### New modules

- `src/i18n/locale.ts`
- `src/i18n/translate.ts`
- `src/i18n/messages/en.ts`
- `src/i18n/messages/fr.ts`
- JSON contract/serializer module under `src/presentation` or `src/commands`,
  selected to avoid a core dependency on CLI concerns
- structured error modules in `src/core` and provider/infrastructure mappings

### Contracts and core behaviour

- `src/core/types.ts`
- `src/core/engine.ts`
- `src/core/fidelity.ts`
- `src/core/result-parser.ts`
- `src/core/errors.ts`
- `src/core/validation.ts`
- `src/core/levels.ts` only for structured invalid-level errors, not prompt text
- `src/application/reprompt.ts`, `bootstrap.ts`, `rewrite-options.ts`
- `src/utils/exit-codes.ts`, `input.ts`, redaction/secret presentation boundary

### Providers and infrastructure

- `src/providers/errors.ts`, `http.ts`, `runtime.ts`, `registry.ts`
- `src/providers/openai.ts`, `anthropic.ts`, `mistral.ts`, `deepseek.ts`,
  `openai-compatible.ts`, `openai-stream.ts`, `mock.ts`
- `src/auth/credentials.ts`
- `src/clipboard/clipboard.ts`
- `src/config/schema.ts`, `loader.ts`
- `src/profiles/registry.ts`, `types.ts` for display metadata separation
- `src/models/presets.ts` for localised descriptions

### CLI and presentation

- `src/cli.tsx`
- every file in `src/commands/`
- `src/ui/errors.ts`, `formatters.ts`, `result-view.ts`, `result-meta.ts`,
  `view-labels.ts`, `modal-options.ts`, `shortcut-hints.ts`, `header-status.ts`,
  `text.ts`, `init-format.ts`
- user-facing files in `src/ui/components/`
- `src/opentui/app.tsx`, `result-presentation.ts`, `shortcuts-view.ts`,
  `launcher.ts` and related text helpers
- reachable legacy `src/app.tsx` and Ink components, or their removal

### Tests and artefacts

- `tests/e2e/cli.test.ts`
- command tests for auth, aliases, config, doctor, init and list
- engine, fidelity, parser, provider, error and config tests
- CLI output, UI, component, responsive, keyboard and streaming tests
- new locale/catalogue/architecture/JSON-contract tests
- benchmark serializers/readers and multilingual fixtures
- README/config documentation and changelog for the `0.2.0` contract

## Acceptance criteria

The i18n implementation is complete only when all of the following are true:

1. English and French are available for every supported public CLI and TUI
   surface.
2. `uiLocale` resolution follows the documented precedence and normalisation
   table on Windows, macOS and Linux.
3. Existing configs load unchanged; `uiLocale: "auto"` is the default.
4. `outputLanguage` remains independent and defaults to `auto`.
5. Core quality diagnostics have no `message` or localised `details` fields.
6. Core/provider/application layers do not import the i18n module.
7. Provider health and all expected errors cross boundaries as stable codes and
   typed parameters.
8. No normal presentation path displays arbitrary `Error.message` directly.
9. `--json` uses the documented versioned envelope and is byte-identical across
   UI locales for the same mocked result/error.
10. JSON never contains translated UI copy, ANSI, stack traces, secrets or raw
    provider response bodies.
11. Model-generated `rewritten`, `changes` and warning detail remain unchanged
    by UI locale.
12. Technical ids, config keys, flags, exit codes and enum values are unchanged.
13. Both catalogues are compile-time exhaustive and interpolation is typed.
14. Commander help/errors, init, auth, doctor, config, aliases, quick output and
    OpenTUI pass English/French tests.
15. Narrow-terminal tests pass in both locales without hidden footer or
    incoherent overflow.
16. Existing unit/integration/E2E suites, build, lint and formatting pass.
17. Fidelity tests pass without changes to LLM system/profile instructions.
18. Paid provider benchmarks are run only when explicitly authorised.
19. The `0.2.0` changelog documents the JSON migration and locale controls.
20. No broad lint exclusion or untranslated-string bypass is introduced merely
    to complete the migration.

## Explicitly out of scope

- Translating `src/core/prompt-builder.ts`, `src/profiles/base.ts` or built-in
  profile instruction bodies.
- Changing the LLM response keys `rewritten`, `changes` and `warnings`.
- Automatic language identification beyond the model's existing preservation
  instruction.
- Provider-specific i18n behaviour.
- Translating raw external API, OS, filesystem, clipboard or model text.
- Translating user-authored custom profiles.
- Localising stored ids, command flags, config keys or JSON schema keys.
- Desktop UI implementation; only reusable architecture for it is required.
- More than `en` and `fr` in the first release.
- Pluralisation infrastructure without a demonstrated product message that
  needs it.
