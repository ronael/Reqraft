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

Custom profile parsing exists internally, but loading user-defined profile files
is not exposed by the CLI yet. For now, adding a profile means adding it to the
source registry as described in [development.md](development.md).
