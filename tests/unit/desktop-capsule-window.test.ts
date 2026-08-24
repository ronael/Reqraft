import { describe, expect, it, vi } from "vitest";

/**
 * Ce qui arrive quand la capsule a été détruite.
 *
 * Elle est censée se cacher et non mourir, mais son garde-fou repose sur un
 * verrou `quitting` qui ne redescend jamais : une fois levé, chaque fermeture
 * détruisait la fenêtre pour de bon. `show()` s'en gardait déjà — pas
 * l'appelant, qui allait chercher `window.webContents` juste après. L'erreur
 * partait alors depuis un `.catch`, donc plus rien ne pouvait la rattraper.
 */

/** La part de `CapsuleWindow` que la garde concerne. */
function fakeWindow(destroyed: boolean) {
  const send = vi.fn();
  const window = {
    isDestroyed: () => destroyed,
    webContents: {
      get send() {
        if (destroyed) throw new TypeError("Object has been destroyed");
        return send;
      },
    },
  };
  return { window, send };
}

/** La même implémentation que `createCapsuleWindow`, isolée d'Electron. */
function notify(window: { isDestroyed: () => boolean; webContents: { send: unknown } }) {
  return (channel: string, payload: unknown): void => {
    if (window.isDestroyed()) return;
    (window.webContents.send as (c: string, p: unknown) => void)(channel, payload);
  };
}

describe("notify sur une capsule détruite", () => {
  it("ne lève rien quand la fenêtre a disparu", () => {
    const { window } = fakeWindow(true);

    expect(() => {
      notify(window)("capsule:opened", { mode: "capture" });
    }).not.toThrow();
  });

  it("transmet normalement quand la fenêtre est vivante", () => {
    const { window, send } = fakeWindow(false);

    notify(window)("capsule:opened", { mode: "input" });

    expect(send).toHaveBeenCalledWith("capsule:opened", { mode: "input" });
  });

  it("sans la garde, l'accès à webContents lève — c'est l'erreur d'origine", () => {
    // Le comportement que la garde remplace : la ligne qui suivait `show()`.
    const { window } = fakeWindow(true);

    expect(() => window.webContents.send).toThrow(/Object has been destroyed/);
  });
});
