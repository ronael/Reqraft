## Platform support

| Platform | Status |
|---|---|
| macOS arm64 (`.dmg`, `.zip`) | Tested by hand |
| Windows x64 (`-experimental.exe`) | Capture and reinjection implemented, not yet tested by hand |
| Linux x86_64 (`-experimental.AppImage`) | Builds, never run — expect breakage |

The experimental builds are published so they can be tried, not because they
are supported. On Windows, selection capture and reinjection are implemented
and pass their native tests, but the installed app has not yet been checked by
hand on a clean machine. Linux has never been run and cannot paste a result
back yet. Neither is signed, so Windows SmartScreen will warn before the
installer runs.

See `docs/desktop-platform-support.md`.
