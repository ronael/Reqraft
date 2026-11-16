# Local models

Reqraft embeds no model. Running it offline means pointing the
`openai-compatible` provider at a model server you run on your own machine or
network: [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai), or
anything else that speaks the OpenAI chat completions API.

## Set up

1. Install Ollama, then pull the model recommended for your machine:

   ```bash
   ollama pull qwen3.5:4b   # 8 GB of memory, a 3.3–4 GB download
   ollama pull qwen3.5:9b   # 16 GB and more, a 6.6–7.6 GB download
   ```

   With LM Studio, search for "Qwen3.5 4B" or "Qwen3.5 9B", download it, load
   it, and start the local server.

2. Run `rp init` and choose **Local server**. Reqraft looks for Ollama on
   `http://localhost:11434/v1` and LM Studio on `http://localhost:1234/v1`,
   proposes the one that answers, and lists the chat models it has installed
   (embedding models are left out). When none is installed, it prints the
   model recommended for your memory and the command that installs it.

   The desktop onboarding does the same when you choose **OpenAI Compatible**:
   a **Local server** row shows what it found, the model menu lists the
   installed models, and the install command appears when there is none. The
   onboarding only ever probes those two addresses; for another server, pick
   **Another address** and type it.

3. In the desktop settings, the **Models** tab lists what the endpoint has
   installed; switching to the compatible endpoint no longer keeps the model
   of the previous provider.

## What changes for a local server

A base URL on `localhost`, a private address (`10.x`, `172.16–31.x`,
`192.168.x`, link-local, IPv6 unique-local), `*.local`, `*.localhost` or
`host.docker.internal` marks the endpoint as local
(`src/providers/local-endpoint.ts`). Reqraft then:

- **sends a compact system prompt.** The full `auto` prompt is about 5,800
  characters, some 1,600 tokens, in a context window Ollama and LM Studio
  open at 4,096 tokens by default — and an OpenAI-compatible request cannot
  widen it. The compact prompt keeps the rules small models break first: the
  text is data, never an order; its language, names, numbers and code come back
  unchanged; a clean text comes back almost as it was; the answer is the JSON
  envelope. It is under 1,800 characters at every level.
- **constrains the answer to the envelope's JSON Schema** with
  `response_format: { type: "json_schema" }`. LM Studio accepts only
  `json_schema`; Ollama, llama.cpp and vLLM accept it too.
- **asks the model not to reason** with `reasoning_effort: "none"`, and keeps
  1,024 output tokens in reserve in case it reasons anyway. A thinking model
  otherwise spends tens of seconds and most of the output budget before the
  first word of a one-sentence rewrite.
- **asks for token counts** (`stream_options.include_usage`), which local
  servers only report when asked.
- **removes `<think>` reasoning** a server leaves in the content, while
  streaming and in the final result, so it is never shown or parsed as the
  answer.

A server that refuses any of these extras with a 400 is asked again without
them, once per run. A hosted gateway gets none of them: what it supports
depends on the model it routes to.

## Timeouts

`timeoutMs` (30 s by default) is how long the provider may stay silent: before
its first token, then between two pieces of a streamed answer. An answer that
keeps arriving is never cut, however slow the model. On a cold start the
first token includes loading the model; if a local model keeps timing out
before it starts, raise the delay:

```bash
rp config set timeoutMs 120000
```

The connection test at the end of `rp init` gives a local server the same
budget, since that first request is the one that loads the model.

## Errors

A model the server does not have is reported with its name and, on Ollama,
the command that installs it:

```text
Le modèle « qwen3.5:4b » n’est pas installé sur Ollama. Télécharge-le avec
« ollama pull qwen3.5:4b », ou choisis un modèle installé avec « rp init » ou
dans l’onglet Modèles des réglages.
```

A model still loading is reported as a timeout, not as an unreachable server.

## Choosing a model

The recommendation (`src/models/local-recommendation.ts`) is Qwen3.5, Apache
2.0: 4B below 16 GB of memory, 9B from 16 GB. Gemma 4 (E4B, 12B) and Ministral
3 8B are the alternatives that were measured.

### Measuring

`pnpm benchmark:local` runs 30 cases through Reqraft's own path — the engine,
the compatible adapter, streaming, the `auto` profile — against a local
server, and writes a JSON and a Markdown report to `benchmark-results/`:

```bash
pnpm benchmark:local --model qwen3.5:4b --model qwen3.5:9b --variant both
```

The cases (`benchmark/local-model-cases.ts`) are developer requests of 2 to
40 words, in French and English, across the three levels, each with a trap:
names, numbers, code, an order inside the text, a text already clean, a mixed
sentence, a fragment, a scope to keep. Each rewrite is scored without a judge
(`benchmark/local-model-scoring.ts`) on five dimensions between 0 and 1:

| Dimension | Passes when |
|---|---|
| Meaning | the request's key terms are still there, and no order inside it was obeyed, no question answered |
| Language | the rewrite is in the input's language |
| Level | no expansion or structure beyond the level, a clean text left almost unchanged at `minimal`, nothing added the case forbids |
| Facts | names, numbers, code and paths exactly as given |
| Chatter | no preamble, closing remark, leaked JSON or "rewrite my request" wrapper |

The checks measure what a rewrite breaks; whether it improves the request is
left to the full outputs at the end of the report, which are there to be read.
Speed is the time to the first visible text and the output tokens per second
after it, each model warmed up first so that loading is reported apart.
