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

They build, and they are published so they can be tried. Windows manual testing
has started, but the complete product path has not been validated; Linux has not
been run yet. The app leans on macOS APIs for the parts that matter: selection
capture and reinjection go through `osascript`, and permissions through the
Accessibility and Automation prompts. Those paths have no implementation on
the other two platforms yet, so an installer that launches may still be an app
that cannot do its job.

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
   [`desktop-macos-manual-checklist.md`](desktop-macos-manual-checklist.md).
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

With none of them set, electron-builder produces an unsigned build. macOS will
refuse to open it without a Gatekeeper override, which is acceptable for
testing and not for distribution.

Once the secrets exist, set `notarize: true` under `mac` in
`electron-builder.yml` and make an official release **fail** when signing was
skipped, rather than quietly publishing an unsigned installer.

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
