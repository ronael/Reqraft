## Unsigned macOS installer

This repository has no Apple Developer ID yet, so the macOS installer is
neither signed nor notarised. On first launch, macOS refuses to open Reqraft
and may say the app is damaged. If you downloaded it from this page, move
Reqraft to Applications, then run this once in Terminal:

```sh
xattr -dr com.apple.quarantine /Applications/Reqraft.app
```

Reqraft then opens normally. See `docs/desktop-platform-support.md`.
