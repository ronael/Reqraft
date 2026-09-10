# Reqraft — geometric rq identity

The selected logo has been redrawn as editable vector geometry from
`reqraft-logo-proposal.png`. That PNG remains the original concept reference.
The shipped version uses flat lavender and a dark tile, with clean paths at
small sizes.

## Editable files

- Master: `src/apps/desktop/renderer/assets/brand/reqraft-mark.svg`.
- Published identical copy: `docs/assets/reqraft-mark.svg`.
- Symbol without background or frame: `docs/brand-kit/reqraft-monogram.svg`.

The master contains named groups (`background`, `frame`, `monogram`) and
separate paths (`letter-r`, `letter-q`). There are no linked images or fonts.
Open the SVG in Illustrator to edit its points, colors and outline. Save as
Illustrator `.ai` there if desired; the files supplied here are real SVGs,
not renamed PNGs or simulated `.ai` documents.

Edit the master, then run:

```sh
node --import tsx scripts/generate-icon.ts
```

This requires the project's Electron and a graphical session. It regenerates:

- `build/icon.png` — 1024px application icon for electron-builder;
- `src/apps/desktop/main/tray-icons.generated.json` — 18px transparent
  monograms in idle, busy and error colors from the shared palette;
- the public SVG, frameless symbol, social and README banners.

`BrandMark` consumes the master in the capsule, settings and welcome tour.
The landing uses the public copy for navigation, footer, product demos and
favicon. The test `desktop-brand-assets.test.ts` detects divergence between
the desktop and public vectors. Historical design mockups remain references,
and the terminal CLI keeps its text identity.

The old JetBrains Mono license remains alongside the prior identity's source
history. The current geometric mark uses no font.

Preview: [logo at several sizes](landing-rq-mark-isolated.html).
Regeneration changes project files; it neither publishes the site nor installs
a new desktop package.
