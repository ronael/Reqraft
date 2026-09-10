/** Generate electron-builder's 1024px icon from the desktop's outlined landing mark.
 * Usage: node --import tsx scripts/generate-icon.ts (requires a graphical session).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
// Under Node, this package exports its binary path, not the Electron runtime API.
// eslint-disable-next-line sonarjs/no-require-or-define
const electron = require("electron") as string;
const root = fileURLToPath(new URL("../", import.meta.url));
const mark = readFileSync(
  path.join(root, "src/apps/desktop/renderer/assets/brand/reqraft-mark.svg"),
  "utf8",
);
const directory = mkdtempSync(path.join(tmpdir(), "reqraft-icon-"));
const output = path.join(root, "build/icon.png");
const document = `<html><style>*{box-sizing:border-box}html,body{margin:0;width:1024px;height:1024px;background:transparent}main{position:absolute;inset:64px;border-radius:200px;background:#101017;display:grid;place-items:center}svg{width:748px;height:510px}</style><main>${mark}</main></html>`;
const runner = path.join(directory, "render.cjs");
writeFileSync(
  runner,
  `const {app,BrowserWindow}=require('electron');
const {writeFileSync}=require('node:fs');
app.setPath('userData',${JSON.stringify(directory)});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({width:1024,height:1024,show:false,frame:false,transparent:true,webPreferences:{sandbox:true,contextIsolation:true}});
  await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(${JSON.stringify(document)}));
  writeFileSync(${JSON.stringify(output)},(await win.webContents.capturePage()).resize({width:1024,height:1024}).toPNG());
  app.quit();
}).catch(error=>{console.error(error);app.exit(1)});`,
);
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [runner], { env, stdio: "inherit", timeout: 30_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Icon renderer failed: ${String(result.status)}`);
  console.log("build/icon.png generated (1024×1024).");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
