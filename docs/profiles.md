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
rewrite: `core/prompt-builder.ts#buildAutoDetectPrompt` sends every built-in
profile's rules along with the request, asks the model to determine which one
fits best, and to report its choice in the `profile` field of its JSON response
(`core/result-parser.ts#resolveDetectedProfileId` validates it against the
known ids, defaulting to `clean` if the field is missing or unrecognised).

This adds no extra network call and no extra latency over a normal generation —
detection and rewriting happen in the same round trip. It does mean `auto`
requires a configured provider, same as any other profile; there is no local
fallback. This is not a new privacy exposure: the raw request already goes to
the provider for the rewrite itself, with or without `auto`.

## Custom profiles

Custom profile parsing exists internally, but loading user-defined profile files
is not exposed by the CLI yet. For now, adding a profile means adding it to the
source registry as described in [development.md](development.md).
