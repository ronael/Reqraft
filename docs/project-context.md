# Project context

Reqraft reads two layers of settings: yours, and the project you are working in.
A repository can therefore carry its own conventions — a default profile, a
rewriting level, an output language — without anybody reconfiguring their
machine when they change directory.

## Where it lives

A project is any directory containing `.reqraft/`. Reqraft walks up from the
current directory until it finds one, the way `git` finds `.git`. The first one
wins, so a nested repository decides for itself.

```
my-project/
  .reqraft/
    config.json          # conventions for this repository
    profiles/
      review-team.reqraft-profile.json
```

Both are optional: a project can ship profiles without a config, or the reverse.

## Precedence

Command-line options, then the project configuration, then yours, then the
built-in defaults. The project layer **overlays** yours key by key — what it
does not declare stays exactly as you set it.

Nothing you do in the application writes to `.reqraft/`. `rp config set` and the
desktop settings always write to your own configuration file, and they read from
it too: a value that came from a project never becomes permanent by passing
through them.

## What a project may not decide

`.reqraft/config.json` accepts the settings that describe *the work*, and
refuses those that describe *you or your machine*:

| Allowed | Purpose |
|---|---|
| `defaultProfile` | Repository writing convention |
| `defaultLevel` | Amount of permitted restructuring |
| `outputLanguage` | Language expected for this work |
| `fidelityMode` | Strictness of local quality checks |

Everything else is refused. In particular, a repository cannot select a
provider or model, declare an endpoint, name an environment variable, alter the
clipboard, or change runtime and interface preferences. A project file is
untrusted input: allowing `baseUrl` plus `apiKeyEnv` would let a repository send
prompts and an environment secret to an arbitrary server.

A refused key is an error naming the file, never a silent skip: a versioned file
that quietly does not apply would make two machines diverge without anyone
noticing.

## Project profiles

Files in `.reqraft/profiles/` use the same format as your own profiles and the
same `.reqraft-profile.json` suffix.

- A project profile may not take the id of a built-in profile — it is reported
  and ignored, like any local file that tries.
- Against a personal profile with the same id, **the project wins**, and the
  profile it covers is reported as shadowed rather than dropped: you can see why
  your own profile is not the one being applied.
- Project profiles are read-only from the CLI and TUI. They are files in the
  repository: edit them there, or duplicate one to get a personal copy.

## The desktop does not have a project

The desktop application reads your configuration and your profiles only. An
application launched from the Dock inherits whatever working directory the
system gave it, and letting a `.reqraft` that happens to sit there decide its
settings would be a side effect nobody asked for. The project layer belongs to
the CLI and the TUI, which are started from a directory you chose.

## Should `.reqraft/` be committed?

Yes — that is what it is for. Its strict allowlist carries no credential and
cannot redirect provider traffic.
