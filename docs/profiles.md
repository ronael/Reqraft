# Profiles

Profiles adapt the system prompt to the type of request. They are independent, testable, and easy to extend.

## Built-in profiles

| Profile      | Description                                |
|--------------|--------------------------------------------|
| `auto`       | The model picks the best-fitting profile   |
| `clean`      | Spelling, grammar, light clarification     |
| `code`       | Developer agents                           |
| `frontend`   | Frontend implementation                    |
| `web-design` | Visual design, landing pages, interfaces   |
| `debug`      | Bugs and errors                            |
| `review`     | Code audits and reviews                    |
| `writing`    | Emails, messages, documents                |

## Detection (`auto`)

`auto` no longer runs a local keyword matcher — an offline heuristic scored 50%
against the labelled cases in `benchmark/cases/dataset.ts`, and had no realistic
path to being made reliable without turning into a larger keyword system to
maintain by hand.

Instead, the model picks the profile itself, in the same call that produces the
rewrite: `core/prompt-builder.ts#buildAutoDetectPrompt` sends a condensed,
level-aware guidance line for every built-in profile along with the request
(not each profile's full `instructions` block — see the comment on
`buildAutoDetectPrompt`), asks the model to determine which one fits best, and
to report its choice in the `profile` field of its JSON response
(`core/result-parser.ts#resolveDetectedProfileId` validates it against the
known ids, defaulting to `clean` if the field is missing or unrecognised — see
"Fallback" below).

**What this does and does not cost.** There is no second generation call and no
second network round trip: detection and rewriting happen in the same request
that a `--profile code` (or any other explicit profile) call would also make.
What is different is the size of that one request: the system prompt carries a
guidance line for every built-in profile instead of just the one that would
have been selected explicitly, which means more input tokens — proportionally
to the number of built-in profiles, a handful of short lines. This can
translate into a small latency and cost difference versus an explicit profile;
`pnpm benchmark:auto-profile` (see below) measures it rather than guessing at
a number here.

`auto` requires a configured provider, same as any other profile — there is no
local fallback if none is configured. This is not a new privacy exposure: the
raw request already goes to the provider for the rewrite itself, with or
without `auto`.

### Fallback

If the model's response omits the `profile` field, is not valid JSON at all,
or names a profile that does not exist, `resolveDetectedProfileId` falls back
to `clean` — a fixed default, never a guess. This is not silent: the result
carries a `profile_detection_fallback` quality signal, the same mechanism as
every other quality signal (`unsupported_additions`, `output_truncated`,
`unstructured_response`…) — so `result.quality.signals` always shows it,
whether or not anything else is checking.

Its severity is `info`, not `warning`: a guessed profile does not mean the
rewrite itself is unreliable, so it does not flip `quality.status` to "needs
review" or add a warning-banner line to `--verbose` output the way
`unstructured_response` does — that would make every default `auto` run under
a provider that simply never fills in `profile` (the `mock` provider, always)
look like something went wrong. It is not treated as an error either way; the
rewrite itself still completes normally.

## Measuring `auto`

`pnpm benchmark:auto-profile [provider] [model]` runs every case in
`benchmark/cases/dataset.ts` through `rewrite({ profile: "auto", ... })` (the
production code path, not a simulation) and reports, per run: overall and
per-profile accuracy against the dataset's labelled profile, a confusion
matrix, the misclassified cases, mean input/output tokens, mean latency, and
how the auto system prompt's size compares to an explicit-profile prompt for
the same cases. Results are written to `benchmark-results/` (git-ignored) as
JSON and Markdown. Defaults to the `mock` provider, which never reports a
`profile` in its response and so is not representative of real accuracy — use
a real provider for numbers worth trusting.

## Custom profiles

Custom profile parsing exists internally, but loading user-defined profile files
is not exposed by the CLI yet. For now, adding a profile means adding it to the
source registry as described in [development.md](development.md).
