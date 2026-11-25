# Reqraft in Codex and Claude Code

Type your request in Codex, Claude Code or another terminal agent as it comes,
press its editor key (**Ctrl+G** in most), and Reqraft rewrites it in place. You see the before and the after, keep it with
Enter, retry with `r`, or cancel with Esc to get your draft back untouched.

## How it works

Codex, Claude Code and the agents listed below can hand the draft you are
typing to an external editor.
They write it to a file, start the program named by `VISUAL` (or `EDITOR`),
wait for it to finish, then put the file's contents back in their input.

Reqraft plays that editor. `rp edit <file>` reads the draft, rewrites it with
your usual provider, profile and level, and writes the result back only if you
keep it. A cancelled or failed rewrite leaves the file as it was, so the agent
gives you your draft back without an error.

To make an agent use `rp edit`, Reqraft adds one line per agent to your shell's
start-up file. The line sets `VISUAL` for that agent only: `git commit` and
every other tool keep your editor. If the agent itself runs a command that
opens an editor, such as `git commit` without `-m`, `rp edit` hands that file
to your `EDITOR` untouched: it only rewrites the agent's drafts, Markdown or
plain-text files outside a `.git` directory.

```sh
# >>> reqraft agents >>>
codex() { VISUAL="rp edit" command codex "$@"; }
claude() { VISUAL="rp edit" command claude "$@"; }
# <<< reqraft agents <<<
```

Nothing is sent to your provider until you press Ctrl+G, and then only the
draft, exactly as a normal `rp` rewrite would send it. Secret detection applies
the same way.

## Turning it on

You need the command-line tool, `rp`. If you only have the desktop app, install
it first:

```sh
npm install -g @reqraft/cli
```

Then pick whichever way suits you.

- **Desktop app**: Settings › AI agents lists the agents found on your
  computer. **Enable** writes the line, **Copy the line** lets you paste it
  yourself.
- **Command line**: `rp agents` shows the same list and offers the same
  choices. `rp init` asks at the end of the setup.
- **Let your agent do it**: **Copy for your agent** (in the app) or the third
  choice of `rp agents` copies short instructions. Paste them into Codex or
  Claude Code and it installs `rp` if needed, then runs
  `rp agents --enable --yes`.

Open a new terminal tab afterwards: a shell only reads its start-up file when
it starts.

```sh
rp agents                 # list the agents and choose what to do
rp agents --enable --yes  # enable every installed agent, without asking
rp agents --print         # print the lines to paste yourself
rp agents --prompt        # print the instructions for your agent
rp agents --disable       # remove Reqraft's lines
```

## Supported agents

| Agent | Command | Shortcut | Note |
|---|---|---|---|
| Codex (OpenAI) | `codex` | Ctrl+G | |
| Claude Code (Anthropic) | `claude` | Ctrl+G | also Ctrl+X Ctrl+E |
| Gemini CLI (Google) | `gemini` | Ctrl+G | version 0.38 or later; an editor chosen with `/editor` takes precedence |
| GitHub Copilot CLI | `copilot` | Ctrl+G | |
| opencode | `opencode` | Ctrl+X E | also `/editor` |
| Kimi Code | `kimi` | Ctrl+G | an editor chosen with `/editor` takes precedence |
| pi | `pi` | Ctrl+G | the `externalEditor` setting takes precedence |
| Mistral Vibe | `vibe` | Ctrl+G | |
| Aider | `aider` | Ctrl+X Ctrl+E | |
| Crush | `crush` | Ctrl+O | reads only `EDITOR`, which its line sets instead of `VISUAL` |
| Grok Build (xAI) | `grok` | Ctrl+G | in minimal mode; in the full interface, "Edit Prompt in External Editor" in the palette |

Not supported, and listed as such when installed:

| Agent | Why |
|---|---|
| Qwen Code | it runs its editor as a single path, with no room for `rp edit` |
| Cursor CLI, Amp | documented, not yet checked in their code |
| goose, Kiro CLI | their editor sends a new prompt instead of handing the draft back |

Checked on 2026-11-25 against each agent's source code, or its documentation
where the code is closed.

## Shells

Reqraft writes for the shell named by `SHELL`, or PowerShell on Windows. Use
`rp agents --shell <name>` to choose another one.

| Shell | File | Line for Codex |
|---|---|---|
| zsh | `~/.zshrc` | `codex() { VISUAL="rp edit" command codex "$@"; }` |
| bash | `~/.bashrc` | same as zsh |
| fish | `~/.config/fish/config.fish` | `function codex --wraps codex; VISUAL="rp edit" command codex $argv; end` |
| PowerShell | `$PROFILE` (`Documents/PowerShell/Microsoft.PowerShell_profile.ps1`) | a `codex` function that sets `$env:VISUAL` for the call, then restores it |

## When something goes wrong

**"Cannot open external editor: set $VISUAL or $EDITOR before starting Codex."**
This agent was started from a shell that has not read the new line. Quit it,
open a new terminal tab (or run `source ~/.zshrc`), and start it again. With
tmux, panes opened before the change keep their old shell: open a new window.

**"editor exited with status 1."** `rp edit` could not run. Check that
`rp --version` works in that terminal, then `rp doctor`.

**The rewrite failed.** The reason stays on screen until you press Enter, and
your draft comes back unchanged.

**Removing it.** `rp agents --disable`, or **Disable** in Settings › AI agents,
removes the block and leaves the rest of the file as it was.
