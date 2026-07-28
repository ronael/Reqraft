# Reqraft Reprompt Audit Notes

Date: 2026-07-28

This document summarizes the recent Reqraft changes for external AI review.

## Goal

Optimize Reqraft for the following dev command while preserving prompt fidelity:

```bash
zsh -ic 'pnpm dev "je voudrais que me crée une landing page style apple en respectant les convention" --stats'
```

Initial observed behavior:

- Latency around `12.77 s`.
- Output was only a light grammar correction.
- Later optimization attempts exposed a broken case where OpenAI returned no visible text while stats were still printed.
- `gpt-5-mini` consumed the output token limit in invisible reasoning tokens.

Target:

- Response under 5 seconds in dev.
- Visible reformulated prompt must be printed.
- Empty provider responses must fail clearly.
- Short inputs must stay short and must not be expanded into a mini specification.

## Main Changes

### OpenAI Provider Robustness

File:

- `src/providers/openai.ts`

Changes:

- Uses `max_completion_tokens` instead of deprecated/incompatible `max_tokens`.
- Omits `temperature` for `gpt-5*` models because some GPT-5-family models reject non-default temperature.
- Sends `reasoning_effort` only when supported.
- Adds `response_format: { type: "json_object" }`.
- Extracts reasoning token metadata from `completion_tokens_details.reasoning_tokens`.
- Computes visible output tokens as:

```text
visibleOutputTokens = completionTokens - reasoningTokens
```

### Empty Output Handling

Files:

- `src/core/validation.ts`
- `src/core/engine.ts`

Changes:

- Added central validation:

```ts
assertNonEmptyResult(text)
```

- Empty provider output now throws a clear error:

```text
Le modèle a consommé la limite de sortie sans produire de texte visible.
Réessaie avec un effort de raisonnement plus faible, une limite supérieure
ou un modèle plus rapide.
```

- Empty output is no longer considered a successful run.
- Clipboard copy is avoided because success output is never reached.

### Stats Output

File:

- `src/commands/reprompt.ts`

Changes:

- Prompt output stays on `stdout`.
- Stats now go to `stderr`.
- Stats now separate:

```text
Entrée
Sortie visible
Raisonnement
Sortie totale
```

This allows:

```bash
rp "ma demande" --stats | pbcopy
```

to copy only the rewritten prompt.

### Model Presets

File:

- `src/models/presets.ts`

Changes:

- Added `gpt-4.1-mini` as the recommended OpenAI preset for fast reprompting.
- Kept `gpt-5-mini`, `gpt-5-nano`, and `gpt-5.1` available.
- `gpt-5-mini` and `gpt-5-nano` use `reasoningEffort: "low"`.
- Dated model IDs such as `gpt-5-mini-2025-08-07` resolve to base preset parameters.

Rationale:

- Real dev test showed `gpt-4.1-mini` produces visible text in about 2-3 seconds.
- `gpt-5-mini` repeatedly consumed output budget in reasoning tokens and returned no visible text at current limits.

### Prompt Fidelity

Files:

- `src/profiles/base.ts`
- `src/profiles/frontend.ts`
- `src/profiles/web-design.ts`
- `src/core/prompt-builder.ts`
- `src/core/fidelity.ts`
- `src/core/engine.ts`

Changes:

- Added stronger base rules against inventing missing information.
- Short input should produce short output.
- Compact standard prompt path added for low latency.
- Web-design/frontend guidance now avoids automatically adding:
  - sections,
  - CTA,
  - testimonials,
  - footer,
  - palette,
  - responsive requirements,
  - accessibility,
  - animations,
  - performance criteria,
  unless present in the input or context.
- Added local fidelity checks:
  - detects common unsupported additions absent from input;
  - detects disproportionate expansion for short inputs;
  - adds warnings instead of silently accepting over-expanded output.

## Real Terminal Tests

These were run by the user locally with a real OpenAI API key.

### Web Design Profile

Command:

```bash
zsh -ic 'pnpm dev "fais une landing page style apple" --profile web-design --stats'
```

Output:

```text
Crée une landing page en respectant le style visuel et les conventions de design d'Apple, avec une mise en page épurée, une typographie soignée et une présentation élégante des produits ou services.

Stats
Durée 2.17 s
Entrée 321 tokens
Sortie visible 57 tokens
Raisonnement 0 tokens
Sortie totale 57 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- Fast and visible.
- Still arguably adds "présentation élégante des produits ou services", which was not explicitly requested.

### Standard Level

Command:

```bash
zsh -ic 'pnpm dev "fais une landing page style apple" --level standard --stats'
```

Output:

```text
Crée une landing page en respectant le style visuel et les conventions de design d'Apple, avec une mise en page épurée, des images de haute qualité, une typographie soignée et une navigation simple.

Stats
Durée 1.65 s
Entrée 321 tokens
Sortie visible 58 tokens
Raisonnement 0 tokens
Sortie totale 58 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- Fast.
- Still invents details: "images de haute qualité" and "navigation simple".

### Complete Level

Command:

```bash
zsh -ic 'pnpm dev "fais une landing page style apple" --level complete --stats'
```

Output:

```text
Crée une landing page avec un style visuel inspiré d'Apple, en respectant leur esthétique épurée, leur typographie, leur usage de l'espace blanc et leur mise en page minimaliste.

Stats
Durée 1.62 s
Entrée 733 tokens
Sortie visible 49 tokens
Raisonnement 0 tokens
Sortie totale 49 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- Fast.
- `complete` currently does not produce the expected structured "Objectif / Contraintes / À vérifier" form.
- It also resolves details about Apple's style rather than preserving ambiguity.

### Frontend Profile

Command:

```bash
zsh -ic 'pnpm dev "ajoute un bouton rouge" --profile frontend --stats'
```

Output:

```text
Ajoute un bouton de couleur rouge dans l'interface utilisateur.

Stats
Durée 1.24 s
Entrée 287 tokens
Sortie visible 26 tokens
Raisonnement 0 tokens
Sortie totale 26 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- Good: short, faithful, no extra states or implementation details.

### Explicit GPT-4.1 Mini

Command:

```bash
zsh -ic 'pnpm dev "fais une landing page style apple" --model gpt-4.1-mini --stats'
```

Output:

```text
Crée une landing page en respectant le style visuel et les conventions de design d'Apple, avec une mise en page épurée, une typographie claire, des images de haute qualité et une navigation simple et intuitive.

Stats
Durée 1.74 s
Entrée 321 tokens
Sortie visible 59 tokens
Raisonnement 0 tokens
Sortie totale 59 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- Fast.
- Still invents some visual details and navigation.

### Explicit GPT-5 Mini

Command:

```bash
zsh -ic 'pnpm dev "fais une landing page style apple" --model gpt-5-mini --stats'
```

Output:

```text
Erreur : Le modèle a consommé la limite de sortie sans produire de texte visible. Réessaie avec un effort de raisonnement plus faible, une limite supérieure ou un modèle plus rapide.
 ELIFECYCLE  Command failed with exit code 1.
```

Audit note:

- Good failure behavior.
- No silent success with empty output.
- Confirms `gpt-5-mini` is not currently a good default at this output limit.

## Additional Validation Performed

Command:

```bash
zsh -ic 'pnpm dev "je voudrais que me crée une landing page style apple en respectant les convention" --stats'
```

Latest observed output after additional fidelity tightening:

```text
Crée une landing page au style Apple en respectant les conventions existantes du projet.

Stats
Durée 2.11 s
Entrée 329 tokens
Sortie visible 31 tokens
Raisonnement 0 tokens
Sortie totale 31 tokens
Coût estimé non disponible
Provider openai · Modèle gpt-4.1-mini-2025-04-14
```

Audit note:

- This is the best observed output so far.
- It is short, faithful, and under 5 seconds.

## Automated Tests Added Or Updated

Files:

- `tests/unit/fidelity.test.ts`
- `tests/unit/prompt-builder.test.ts`
- `tests/unit/engine.test.ts`
- `tests/integration/providers.test.ts`
- `tests/e2e/cli.test.ts`
- `tests/unit/config.test.ts`
- `tests/unit/profiles.test.ts`

Coverage includes:

- Empty provider response is rejected.
- OpenAI reasoning tokens are separated from visible output tokens.
- Stats are written to `stderr`.
- Prompt remains on `stdout`.
- `gpt-5-mini` payload avoids unsupported `temperature`.
- `max_completion_tokens` is used for OpenAI.
- `response_format: { type: "json_object" }` is sent for OpenAI.
- Short landing-page prompt detects as `web-design`.
- Fidelity warnings detect unsupported additions.
- Standard prompt remains compact.

## Project Validation

Latest validation commands passed:

```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Latest test result:

```text
13 passed
73 tests passed
```

## Known Open Questions For Audit

1. Should `complete` level enforce a structured format for short under-specified requests?

Current `complete` output is still short and not structured. The desired behavior may be:

```text
Objectif:
...
Contraintes:
...
À vérifier:
...
```

2. Should references like "style Apple" be allowed to expand into "typography, white space, minimalist layout"?

This may be useful, but it risks inventing constraints. Current best output avoids that expansion for the longer test prompt, but some shorter prompts still expand.

3. Should fidelity warnings become hard errors?

Currently unsupported additions are warnings. The product may prefer a non-zero exit when the output includes additions absent from the input.

4. Should `--explain` show the rewritten prompt plus changes?

Currently `--explain` displays only the changes section, not the rewritten prompt. This can confuse manual audits.

5. Should output token limits differ for reasoning and non-reasoning models?

`gpt-5-mini` needs a higher output limit to produce visible text, but this harms latency. `gpt-4.1-mini` is currently better for Reqraft's use case.

## Suggested Next Improvements

1. Add a fidelity benchmark fixture with expected forbidden additions for:
   - `ajoute un bouton rouge`
   - `corrige la page login`
   - `fais une landing page style apple`
   - `améliore cette card`
   - `mets le formulaire en responsive`
   - `change le texte du hero`

2. Make `complete` level explicitly separate:
   - objective,
   - constraints,
   - missing information to verify.

3. Consider a `strictFidelity` config option:

```json
{
  "strictFidelity": true
}
```

This could convert unsupported additions from warnings to errors.

4. Improve `--explain` to include both rewritten prompt and changes.

## Follow-up Update

After this audit, Reqraft adopted an OpenAI-first validation strategy:

- `gpt-4.1-mini` remains the reference model.
- Multi-provider real validation is deferred until the OpenAI behavior is fully stable.
- A provider contract was added in [provider-contract.md](provider-contract.md).
- A 40-case fidelity benchmark dataset was added in `benchmark/fidelity-cases.ts`.
- `--explain` now keeps the rewritten prompt on stdout and writes changes/warnings to stderr.
- Fidelity modes are prepared: `permissive`, `balanced`, `strict`, with `balanced` as default.

Latest real OpenAI checks:

```text
standard landing page:
Crée une landing page au style Apple en respectant les conventions existantes du projet.
Durée 2.11 s · sortie visible 31 tokens

complete landing page:
Objectif / Contraintes / À vérifier structure returned.
Durée 2.54 s · sortie visible 120 tokens
```
