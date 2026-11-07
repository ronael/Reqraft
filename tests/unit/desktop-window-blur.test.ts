import { describe, expect, it, vi } from "vitest";

/**
 * Ce que fait une fenêtre qui perd le focus.
 *
 * La capsule et le popover se masquaient à la moindre perte de focus : un clic
 * ailleurs pour relire ou copier quelque chose jetait le résultat. Ils restent
 * désormais quand la préférence le demande, et ce choix est relu à chaque perte
 * de focus, pour qu'un changement dans les réglages s'applique sans relancer.
 */

const { FakeWindow, created } = vi.hoisted(() => {
  const windows: InstanceType<typeof Fake>[] = [];
  class Fake {
    readonly handlers = new Map<string, () => void>();
    readonly hide = vi.fn();
    readonly loadURL = vi.fn(() => Promise.resolve());
    readonly setVisibleOnAllWorkspaces = vi.fn();
    readonly webContents = { isDevToolsOpened: () => false };

    constructor() {
      windows.push(this);
    }

    on(event: string, handler: () => void): this {
      this.handlers.set(event, handler);
      return this;
    }

    isDestroyed(): boolean {
      return false;
    }

    /** Ce qu'Electron déclenche quand une autre application prend le focus. */
    loseFocus(): void {
      this.handlers.get("blur")?.();
    }
  }
  return { FakeWindow: Fake, created: windows };
});

vi.mock("electron", () => ({ BrowserWindow: FakeWindow, app: { on: vi.fn() }, screen: {} }));

const { createCapsuleWindow } = await import("@/apps/desktop/main/windows/capsule.js");
const { createPopoverWindow } = await import("@/apps/desktop/main/windows/popover.js");

const OPTIONS = { preloadPath: "preload.cjs", rendererUrl: "rq://renderer/index.html" };

function lastWindow(): InstanceType<typeof FakeWindow> {
  const window = created.at(-1);
  if (window === undefined) throw new Error("no window created");
  return window;
}

describe.each([
  [
    "la capsule",
    (keepOpenOnBlur?: () => boolean) =>
      createCapsuleWindow(keepOpenOnBlur ? { ...OPTIONS, keepOpenOnBlur } : OPTIONS),
  ],
  [
    "le popover",
    (keepOpenOnBlur?: () => boolean) =>
      createPopoverWindow(keepOpenOnBlur ? { ...OPTIONS, keepOpenOnBlur } : OPTIONS),
  ],
])("%s qui perd le focus", (_name, create) => {
  it("reste affiché quand la préférence le demande", () => {
    create(() => true);
    lastWindow().loseFocus();
    expect(lastWindow().hide).not.toHaveBeenCalled();
  });

  it("se masque sans préférence, comme avant", () => {
    create();
    lastWindow().loseFocus();
    expect(lastWindow().hide).toHaveBeenCalledOnce();
  });

  it("relit la préférence à chaque perte de focus", () => {
    let keepOpen = true;
    create(() => keepOpen);
    const window = lastWindow();

    window.loseFocus();
    keepOpen = false;
    window.loseFocus();

    expect(window.hide).toHaveBeenCalledOnce();
  });
});
