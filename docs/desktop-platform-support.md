# Desktop platform support

What the desktop app is actually supported on — not what it compiles for.

A build that succeeds proves the bundler ran. It does not prove the app opens,
captures a selection, or reinjects text. Those are different claims, and this
file keeps them apart: **buildable** is not **validated**.

All three platforms are published, but only the validated one is published
without a warning. The others carry `-experimental` in their file name and a
table in the release notes saying what they are worth.

| Platform | Build | Manual validation | Distribution |
|---|---|---|---|
| macOS arm64 | yes | yes | GitHub Release (`.dmg`, `.zip`) |
| Windows x64 | yes | **in progress** | GitHub Release, marked `-experimental` |
| Linux x64 | yes | **no** | GitHub Release, marked `-experimental` |

## Why Windows and Linux say `-experimental`

They build, and they are published so they can be tried. Windows now has a
dedicated selection adapter: it records the foreground window through Win32,
reads the selection through UI Automation when the application exposes it,
otherwise sends `Ctrl+C` once the shortcut's keys are released, and brings back
that exact window before pasting with `Ctrl+V`. Its controlled native test
passes, but the complete installed product path has not yet been validated on a
clean machine. Linux has not been run and still has no injection adapter. On
macOS, capture first reads the selection through the Accessibility API and only
falls back to `⌘C` when the application does not expose it; reinjection goes
through `osascript`. Both need the Accessibility and Automation permissions.

On every platform, when nothing could be captured but the clipboard holds text,
the capsule offers that text instead of an empty field. Nothing is sent before
the user asks for the rewrite, and the result is pasted back into the
application the shortcut was pressed in.

Shipping them silently alongside the macOS build would imply parity that does
not exist, so the marker is carried in two places that survive separately:

- **the file name** — `Reqraft-0.3.0-win-x64-experimental.exe` still says it
  once the download is sitting in a folder, long after the page is closed;
- **the release notes** — a table stating what each platform is worth, added
  automatically by `.github/workflows/desktop.yml`.

Neither is signed either, so SmartScreen and Gatekeeper will object.

## Promoting a platform

1. Download the installer from the release, or from the workflow run.
2. Run it on the target OS: install, launch, trigger the capsule, run a
   generation, accept a result. On macOS, work through
   [`desktop-macos-manual-checklist.md`](desktop-macos-manual-checklist.md);
   on Windows, use
   [`desktop-windows-manual-checklist.md`](desktop-windows-manual-checklist.md).
3. Update the row above with what you found.
4. Drop the `-experimental` suffix from that platform's `artifactName` in
   `electron-builder.yml`, and remove its row from the note in
   `.github/workflows/desktop.yml`.

Step 4 is two edits. The gate is step 2, and it is deliberate.

## Architectures

macOS ships **arm64** only, because that is what has been run. `x64` and
`universal` are one line in `electron-builder.yml` when either is validated;
nothing else in the pipeline assumes a single architecture.

Windows and Linux are **x64**. No 32-bit target: no known machine needs one.
The Linux artefact is named `x86_64` rather than `x64` — that is the name the
AppImage ecosystem uses, and renaming it would only surprise the people who
download it.

Linux ships **AppImage** only. `deb`, `rpm`, `snap` and `flatpak` will be added
if a real request appears, not in anticipation of one.

## Code signing

Neither platform is signed today. Both are wired so that signing activates the
moment the secrets exist, and neither has a certificate in this repository.

### macOS

| Secret | Purpose |
|---|---|
| `MAC_CSC_LINK` | base64 of the Developer ID `.p12` |
| `MAC_CSC_KEY_PASSWORD` | password for that `.p12` |
| `APPLE_ID` | Apple account used for notarisation |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password for that account |
| `APPLE_TEAM_ID` | team the Developer ID belongs to |

With none of them set, electron-builder produces an unsigned build, and that is
what every release ships until a Developer ID exists. The workflow says so in
its run and puts a warning at the top of the release notes
(`.github/desktop-unsigned-note.md`): macOS refuses to open the app, and may
call it damaged, until the quarantine attribute is removed. A partial
configuration stops the release instead.

To rebuild the installers of a release that is already out, run the workflow
from `main` with that tag:

```sh
gh workflow run desktop.yml --ref main -f tag=v0.6.5 -f attach_to_release=true
```

Once the secrets exist, set `notarize: true` under `mac` in
`electron-builder.yml` and make an official release **fail** when signing was
skipped, rather than publishing an unsigned installer.

### Windows

| Secret | Purpose |
|---|---|
| `WIN_CSC_LINK` | base64 of the code signing certificate |
| `WIN_CSC_KEY_PASSWORD` | password for it |

Unsigned Windows builds trigger SmartScreen warnings. Acceptable for internal
testing, not for distribution — the same gate as macOS applies when Windows is
promoted.

## Auto-update

Not implemented. `electron-updater` comes after distribution is reliable, not
before. `electron-builder.yml` has no `publish` channel configured, which is
what keeps the updater inert.
