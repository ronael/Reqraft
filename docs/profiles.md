# Profiles

Profiles adapt the system prompt to the type of request. They are independent, testable, and easy to extend.

## Built-in profiles

| Profile      | Description                                |
|--------------|--------------------------------------------|
| `auto`       | Local keyword-based detection              |
| `clean`      | Spelling, grammar, light clarification     |
| `code`       | Developer agents                           |
| `frontend`   | Frontend implementation                    |
| `web-design` | Visual design, landing pages, interfaces   |
| `debug`      | Bugs and errors                            |
| `review`     | Code audits and reviews                    |
| `writing`    | Emails, messages, documents                |

## Detection (`auto`)

`auto` uses local keyword matching. It never calls an LLM to choose the profile. In case of low confidence, it falls back to `clean`.

## Custom profiles

Custom profiles can be stored in:

```text
~/.config/rp/profiles/
```

Supported formats:

```md
---
id: kubora
name: Kubora
extends: frontend
defaultLevel: standard
---

Conserve les composants existants et respecte le design system Kubora.
```

Or JSON:

```json
{
  "id": "kubora",
  "name": "Kubora",
  "extends": "frontend",
  "defaultLevel": "standard",
  "instructions": "Conserve les composants existants..."
}
```

Load a custom profile with `--profile <id>`.
