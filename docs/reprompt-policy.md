# Reprompt policy

Reqraft separates technical failures from quality findings.

## Result contract

A provider response is returned whenever it contains usable text. Quality
analysis never hides a response after tokens have been consumed.

Blocking failures are limited to cases where no usable result exists:

- authentication or provider failure;
- network failure or timeout;
- empty response;
- unrecoverable provider payload.

Parseable responses that hit a provider output limit remain available and are
marked `risky`. Raw, non-JSON responses also remain available and are marked for
review.

`permissive`, `balanced` and `strict` control the severity of fidelity findings,
not whether the result is returned. Automation can opt into a non-zero exit code
with `--fail-on-quality`; the rewritten prompt is still written to stdout.

## Central policy

All product values that affect completeness, cost or fidelity live in
`src/core/reprompt-policy.ts`.

### Output budget

The default budget is adaptive:

```text
estimated source tokens + structural reserve + optional reasoning reserve
```

Source tokens are estimated from characters because Reqraft supports providers
with different tokenizers. The estimate is deliberately conservative and does
not claim billing precision.

Structural reserves:

| Level    |      Reserve | Rationale                                          |
| -------- | -----------: | -------------------------------------------------- |
| minimal  |   256 tokens | JSON envelope and a faithful source-length rewrite |
| standard |   512 tokens | moderate clarification and short structure         |
| complete | 1,024 tokens | detailed brief without dropping source intent      |

Reasoning models receive an additional 1,024-token reserve because some APIs
count hidden reasoning against the output budget.

When the registry knows a model output limit, it is the hard ceiling. Unknown
models use an 8,192-token safety ceiling to prevent unbounded cost. Users may
replace the adaptive budget with an explicit limit, either higher or lower,
without exceeding the model ceiling:

```bash
rp config set maxOutputTokens 2000
rp "..." --max-output-tokens 2000
```

### Runtime

The generation timeout defaults to 30 seconds and is applied to the provider
request through `AbortSignal`. Credential and setup checks use a shorter
10-second timeout. Both defaults are centralized in the policy module.

```bash
rp config set timeoutMs 45000
rp "..." --timeout 45000
```

### Fidelity

Expansion is a diagnostic, not a rejection rule. Each level uses one continuous
formula instead of the former 30-, 80- and 90-word branches:

| Level | Source multiplier | Structural allowance |
|---|---:|---:|
| minimal | 2 | 15 words |
| standard | 4 | 30 words |
| complete | 8 | 80 words |

The formula is intentionally explainable and non-blocking. It must be changed
only with benchmark evidence, because some valid tasks such as plans naturally
expand short requests.

#### Structure added

Word count misses one frequent case: a sentence that comes back as a six-bullet
specification without growing much. That is a change of nature, not of size, so
it is counted separately — bullets and headings the output added that the input
did not have.

| Level | Added list items | Added headings |
|---|---:|---:|
| minimal | 0 | 0 |
| standard | 4 | 1 |
| complete | 10 | 3 |

Only what the output *adds* counts: a request already written as a list may come
back as a list without anything having been invented.

#### Paths and commands

A file path or a shell command present in the output and absent from the request
is reported by name. These are the costliest inventions — they look like a
verified fact, and somebody will run them — and the only ones that can be
checked without ambiguity: the path is in the request, or it is not.

Detection is deliberately conservative. URLs, dates, fractions and two words
separated by a slash are not paths; a command is a known binary *with its first
argument*, so a request mentioning `git status` does not license an invented
`git push`. A test keeps the detectors silent across the whole benchmark corpus:
a warning that fires on an honest request teaches people to ignore the ones that
matter.

## Quality states

- `good`: no warning requiring user attention;
- `review`: usable result with fidelity, model or formatting warnings;
- `risky`: usable but potentially incomplete result, such as output truncation.

The JSON output exposes the structured `quality.signals` collection. Human CLI
output sends quality diagnostics to stderr, preserving a clean prompt on stdout.
