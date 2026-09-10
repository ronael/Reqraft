/** Regenerate desktop and public brand assets from the editable SVG master.
 * Usage: node --import tsx scripts/generate-icon.ts (graphical session required).
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { PALETTE_VALUES } from "@/shared/palette-values.js";

const require = createRequire(import.meta.url);
// Under Node this package exports its binary path, not the Electron runtime API.
// eslint-disable-next-line sonarjs/no-require-or-define
const electron = require("electron") as string;
const root = fileURLToPath(new URL("../", import.meta.url));
const master = path.join(root, "src/apps/desktop/renderer/assets/brand/reqraft-mark.svg");
const mark = readFileSync(master, "utf8");
const monogram = mark
  .replace(/<g id="background">[\s\S]*?<\/g>/u, "")
  .replace(/<g id="frame">[\s\S]*?<\/g>/u, "")
  .replace('viewBox="0 0 512 512"', 'viewBox="96 128 320 288"');
const directory = mkdtempSync(path.join(tmpdir(), "reqraft-brand-"));
const trayOutput = path.join(root, "src/apps/desktop/main/tray-icons.generated.json");
const html = (body: string): string =>
  `<html><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${body}</html>`;
const banner = (compact: boolean): string =>
  html(`
<style>body{background:#0b0b10;color:#f4f4f5;font-family:Arial,sans-serif;padding:${compact ? "48px 64px" : "100px"};display:flex;align-items:center;gap:56px}
.symbol{width:${compact ? "160px" : "300px"};flex-shrink:0}h1{font-size:${compact ? "48px" : "76px"};letter-spacing:-3px;margin:0 0 18px}p{font-size:${compact ? "24px" : "32px"};margin:0;line-height:1.4}em{font-style:normal;color:${PALETTE_VALUES.accent}}small{display:block;color:#a1a1aa;font-size:18px;margin-top:20px}</style>
<div class="symbol">${mark}</div><div><h1>Reqraft</h1><p>Shape the request.<br/><em>Keep the intent.</em></p>${compact ? "" : "<small>Desktop app · Open-source CLI</small>"}</div>`);
const jobs = [
  {
    width: 1024,
    height: 1024,
    output: "build/icon.png",
    document: html(`<main style="position:absolute;inset:64px">${mark}</main>`),
  },
  { width: 1280, height: 640, output: "docs/assets/reqraft-social.png", document: banner(false) },
  { width: 1200, height: 300, output: "docs/assets/reqraft-readme.png", document: banner(true) },
  ...Object.entries({
    repos: PALETTE_VALUES.accent,
    busy: PALETTE_VALUES.accentStrong,
    error: PALETTE_VALUES.danger,
  }).map(([state, color]) => ({
    width: 128,
    height: 128,
    state,
    document: html(monogram.replaceAll(PALETTE_VALUES.accent, color)),
  })),
];
const runner = path.join(directory, "render.cjs");
writeFileSync(
  runner,
  `const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
const path=require('node:path');
app.setPath('userData',${JSON.stringify(directory)});
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const icons={};
  for(const job of ${JSON.stringify(jobs)}) {
    const win=new BrowserWindow({width:job.width,height:job.height,show:false,frame:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true}});
    await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(job.document));
    const screenshot=await win.webContents.capturePage();
    const png=screenshot.resize({width:job.state?18:job.width,height:job.state?18:job.height}).toPNG();
    if(job.state) icons[job.state]=png.toString('base64');
    else writeFileSync(path.join(${JSON.stringify(root)},job.output),png);
    win.destroy();
  }
  writeFileSync(${JSON.stringify(trayOutput)},JSON.stringify(icons,null,2)+String.fromCharCode(10));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});`,
);
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [runner], { env, stdio: "inherit", timeout: 30_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Brand renderer failed: ${String(result.status)}`);
  copyFileSync(master, path.join(root, "docs/assets/reqraft-mark.svg"));
  writeFileSync(path.join(root, "docs/brand-kit/reqraft-monogram.svg"), monogram);
  console.log("Application icon, tray states, public SVG and banners generated.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
