# Ordering the profile list

Roadmap, *Next — passer à l'échelle des profils*: “Étudier un ordre par usage
récent plutôt qu'un ordre fixe, une fois qu'un catalogue réel existe.”

This is that study. It describes what the fixed order costs today, what a
recency order would cost, and what to build if the answer is yes.

## What exists

`listProfiles()` returns built-ins in registry order, then project profiles,
then personal ones by file name. Every surface groups by origin on top of that:

- desktop — `groupProfiles()`, order `auto`, `builtin`, `project`, `local`;
- TUI — sections carried on each option, same order;
- CLI — the same headings in `rp profiles list`.

Nothing anywhere records that a profile was *used*. The only per-user signal is
`defaultProfile` in the configuration, which is a choice, not a habit.

## What the fixed order costs

It costs nothing until the catalogue grows. With eight profiles the list is one
screen and the order is irrelevant. The cost appears at the scale the roadmap
targets — several dozen — and it is narrow: the profile you reach for ten times
a day sits wherever its file name puts it.

Search already absorbs most of that. Both pickers filter as you type, on id,
name and description, ignoring case and accents. Reaching a known profile is
three keystrokes regardless of position. Recency helps a different case: the
profile you want but would not think to name.

## Why a naive recency order is a bad idea

A list that reorders itself between two openings is hostile to the thing people
actually build — muscle memory. “Third from the top” stops being true, and the
gesture that worked yesterday selects something else today. That is worse than
a suboptimal but stable order, and it is the reason macOS abandoned
recently-used menus.

Three constraints fall out of that:

1. **Only reorder inside a group.** The origin grouping is information — “this
   comes from the repository” — and must not move.
2. **Never reorder the first rows under the cursor.** `auto` leads because it
   is the default; a recency order that displaces it changes what Enter does.
3. **Reorder rarely, not continuously.** A list recomputed at every open is the
   moving-target problem. Recompute at start-up, not per keystroke.

## What it would take

State that does not exist yet:

- a small usage log — profile id, timestamp, count — outside `config.json`,
  because it is data, not a setting, and it must not travel to a project or be
  diffed in a repository;
- a decay, otherwise a profile used heavily once outranks the one used daily;
- a write on every run, which is the part to be careful about: the CLI must not
  gain a disk write on the hot path, and the desktop must not write from the
  renderer.

The natural home is the user config directory, next to `profiles/`, in a file
the application owns and never merges from a project.

## Recommendation

**Not yet, and not as recency.** Search covers most of the value without the
moving-target cost:

1. **Keep a fixed order inside each group.** The selected profile must not jump
   to the top after every choice; that would recreate recency ordering under a
   different name. Pinning the configured default is only safe once every
   surface receives that value explicitly and consistently.
2. **Keep search as the primary path** and make it discoverable, which the TUI
   now does by announcing “type to filter”.

Revisit recency only when someone reports the problem it solves, with a real
catalogue of several dozen profiles. Until then, the state, the decay and the
write on the hot path buy an ordering nobody has asked for.

## If it is built anyway

Make it observable and reversible: a setting to turn it off, the log in a
readable file, and the ordering computed by a pure function so the ranking is
testable without a disk. The picker contract — bounded list, search, grouping —
does not change; only the order inside a group does.
