import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CapsuleUiWindow } from "./e2e-capsule.js";

export interface PopoverUiReport {
  window: { width: number; height: number };
  content: { clientHeight: number; scrollHeight: number };
  footer: { top: number; bottom: number };
  copy: { top: number; bottom: number };
  footerVisible: boolean;
  copyInFooter: boolean;
  copyInContent: boolean;
  shot?: string;
}

interface PopoverUiTargets {
  window: () => CapsuleUiWindow;
  open(): void;
  shotsDir?: string;
}

async function evaluate<T>(target: CapsuleUiWindow, code: string): Promise<T> {
  return (await target.webContents.executeJavaScript(code, true)) as T;
}

async function waitForSelector(
  target: CapsuleUiWindow,
  selector: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (
      await evaluate<boolean>(
        target,
        `document.querySelector(${JSON.stringify(selector)}) !== null`,
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`timed out waiting for ${selector}`);
}

function fillScript(selector: string, text: string): string {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    if (field === null) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(field, ${JSON.stringify(text)});
    field.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`;
}

/** Pilote le vrai popover jusqu'à un résultat assez long pour défiler. */
export async function runPopoverUiScenario(targets: PopoverUiTargets): Promise<PopoverUiReport> {
  targets.open();
  const target = targets.window();
  await waitForSelector(target, ".popover-input");

  const prompt = Array.from(
    { length: 24 },
    (_, index) => `point ${String(index + 1)} a reformuler proprement`,
  ).join("\n");
  await evaluate<boolean>(target, fillScript(".popover-input", prompt));
  await evaluate<boolean>(
    target,
    `(() => { document.querySelector(".popover-reformulate")?.click(); return true })()`,
  );
  await waitForSelector(target, ".popover-result");
  await waitForSelector(target, ".popover-footer .key-primary");
  await new Promise((resolve) => setTimeout(resolve, 300));

  const report = await evaluate<Omit<PopoverUiReport, "window" | "shot">>(
    target,
    `(() => {
      const content = document.querySelector(".popover-content");
      const footer = document.querySelector(".popover-footer");
      const copy = footer?.querySelector(".key-primary") ?? null;
      if (content === null || footer === null || copy === null) throw new Error("popover incomplete");
      const footerRect = footer.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      return {
        content: { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight },
        footer: { top: Math.round(footerRect.top), bottom: Math.round(footerRect.bottom) },
        copy: { top: Math.round(copyRect.top), bottom: Math.round(copyRect.bottom) },
        footerVisible: footerRect.top >= 0 && footerRect.bottom <= window.innerHeight + 1,
        copyInFooter: copy.closest(".popover-footer") !== null,
        copyInContent: copy.closest(".popover-content") !== null,
      };
    })()`,
  );

  const bounds = target.getBounds();
  let shot: string | undefined;
  if (targets.shotsDir !== undefined) {
    await mkdir(targets.shotsDir, { recursive: true });
    shot = path.join(targets.shotsDir, "popover-result.png");
    await writeFile(shot, (await target.webContents.capturePage()).toPNG());
  }
  return {
    ...report,
    window: { width: bounds.width, height: bounds.height },
    ...(shot === undefined ? {} : { shot }),
  };
}
