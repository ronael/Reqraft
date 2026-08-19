## Platform support

| Platform | Status |
|---|---|
| macOS arm64 (`.dmg`, `.zip`) | Tested by hand |
| Windows x64 (`-experimental.exe`) | Builds, never run — expect breakage |
| Linux x86_64 (`-experimental.AppImage`) | Builds, never run — expect breakage |

The experimental builds are published so they can be tried, not because they
are supported. Selection capture and reinjection are implemented for macOS
only, so on Windows and Linux the app may launch without being able to do its
job. Neither is signed: SmartScreen and Gatekeeper will object.

See `docs/desktop-platform-support.md`.
