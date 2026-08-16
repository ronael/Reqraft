import type { CapturedFrame, CapturedSpan } from "@opentui/core";

/**
 * Serialises a captured OpenTUI frame into HTML — one `<span>` per styled run,
 * exact foreground and background per cell.
 *
 * The point is to look at what the TUI really draws without having to squint at
 * a terminal: colours, alignment and spacing come straight from the renderer,
 * nothing is restyled on the way out.
 */

/** DIM is rendered by terminals as reduced intensity, not as a different hue. */
const DIM_OPACITY = 0.62;
const ATTR = { BOLD: 1, DIM: 2, ITALIC: 4, UNDERLINE: 8 } as const;

export interface SceneCapture {
  id: string;
  title: string;
  caption: string;
  frame: CapturedFrame;
}

function hex(color: { toInts(): [number, number, number, number] }): string {
  const [r, g, b] = color.toInts();
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function escapeHtml(text: string): string {
  // `white-space:pre` preserves runs of spaces, so only markup characters matter.
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function spanHtml(span: CapturedSpan): string {
  const styles = [`color:${hex(span.fg)}`, `background:${hex(span.bg)}`];
  if ((span.attributes & ATTR.BOLD) !== 0) styles.push("font-weight:600");
  if ((span.attributes & ATTR.DIM) !== 0) styles.push(`opacity:${String(DIM_OPACITY)}`);
  if ((span.attributes & ATTR.ITALIC) !== 0) styles.push("font-style:italic");
  if ((span.attributes & ATTR.UNDERLINE) !== 0) styles.push("text-decoration:underline");
  return `<span style="${styles.join(";")}">${escapeHtml(span.text)}</span>`;
}

export function renderFrameHtml(frame: CapturedFrame): string {
  return frame.lines
    .map((line) => `<div class="row">${line.spans.map(spanHtml).join("")}</div>`)
    .join("\n");
}

export function renderScene(scene: SceneCapture): string {
  return `<section class="scene">
  <div class="kick"><b>${escapeHtml(scene.id)}</b> ${escapeHtml(scene.title)}</div>
  <div class="screen">
${renderFrameHtml(scene.frame)}
  </div>
  <p class="cap"><span>${escapeHtml(scene.caption)}</span><span>${String(scene.frame.cols)}×${String(
    scene.frame.rows,
  )}</span></p>
</section>`;
}

/** Shared stylesheet of the snapshot pages. */
const PAGE_STYLE = `:root{
  color-scheme:dark;
  --bg:#09090b; --line:rgba(255,255,255,.12);
  --tx:#e4e4e7; --tx2:#a1a1aa; --tx3:#52525b; --accent:#a78bfa;
  --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:var(--mono);font-size:15px;padding:40px 24px}
.wrap{max-width:960px;margin:0 auto}
h1{font-size:24px;font-weight:600;letter-spacing:-.02em;color:#fff}
.lede{color:var(--tx2);font-size:12.5px;margin-top:10px;line-height:1.6}
.kick{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--tx3);display:flex;align-items:center;gap:14px;margin:48px 0 16px}
.kick::after{content:"";height:1px;flex:1;background:var(--line)}
.kick b{color:var(--accent);font-weight:500}
/* Un écran = la grille de cellules telle que le renderer l'a produite : aucune
   mise en forme ajoutée ici, sinon la capture ne prouverait plus rien. */
.screen{display:inline-block;padding:14px 16px;border-radius:10px;background:#09090b;
  border:1px solid var(--line);overflow-x:auto;max-width:100%}
.row{font-family:var(--mono);font-size:13px;line-height:1.32;white-space:pre}
.cap{font-size:11px;color:var(--tx3);margin:12px 2px 0;display:flex;justify-content:space-between}`;

/** One scene alone in a page — the unit a screenshot tool can capture whole. */
export function renderScenePage(scene: SceneCapture): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Reqraft TUI — ${escapeHtml(scene.title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
${renderScene(scene)}
</div>
</body>
</html>
`;
}

export function renderSnapshotPage(scenes: readonly SceneCapture[], generatedAt: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Reqraft TUI — rendu réel</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="wrap">
<h1>Reqraft TUI — rendu réel</h1>
<p class="lede">Captures cellule par cellule de la TUI, couleurs exactes du renderer.
Écrans obtenus en pilotant la vraie application au clavier, provider <code>mock</code>.
Généré le ${escapeHtml(generatedAt)} par <code>pnpm snapshot:tui</code>.</p>
${scenes.map(renderScene).join("\n")}
</div>
</body>
</html>
`;
}
