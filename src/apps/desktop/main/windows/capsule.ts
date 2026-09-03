import { BrowserWindow, app, screen } from "electron";
import {
  EDGE_MARGIN,
  placeCapsuleOnSide,
  resolveCapsuleSide,
  type CapsuleAnchor,
  type CapsuleSide,
  type WorkArea,
} from "./placement.js";
import {
  CAPSULE_INPUT_HEIGHT,
  CAPSULE_MAX_HEIGHT,
  CAPSULE_RESERVED_HEIGHT,
  CAPSULE_WIDTH,
  capsuleHeightFor,
} from "@/apps/desktop/shared/capsule-geometry.js";

/**
 * The capsule window (DESKTOP.md §3, §4.3): 560 wide, frameless, transparent,
 * HUD vibrancy, above other windows, anchored at the cursor. The working
 * height is reserved up front so the window never jumps while the stream
 * arrives; it only follows the content once the content has stopped moving —
 * see `shared/capsule-geometry.ts` for the three regimes.
 */
export { CAPSULE_WIDTH };
/** Roughly header + 8 body lines + footer: the reserved working height (§4.3). */
export const CAPSULE_HEIGHT = CAPSULE_RESERVED_HEIGHT;

export interface CapsuleWindowOptions {
  preloadPath: string;
  /** `rq://` URL of the renderer (custom protocol — modules fail on file://). */
  rendererUrl: string;
  /** Vite dev server URL; when absent the built renderer is loaded. */
  devServerUrl?: string;
}

export interface CapsuleWindow {
  /**
   * Envoie un message au renderer, ou ne fait rien si la fenêtre a disparu.
   *
   * `show()` se gardait déjà de la destruction, mais les appelants allaient
   * ensuite chercher `window.webContents` eux-mêmes : la garde était au mauvais
   * endroit, et la ligne suivante levait « Object has been destroyed ». Comme
   * elle était levée depuis un `.catch`, la nouvelle erreur ne pouvait plus
   * être rattrapée — d'où les rejets non gérés en cascade.
   */
  notify(channel: string, payload: unknown): void;
  window: Electron.BrowserWindow;
  /**
   * Places the capsule on its anchor, then shows and focuses it.
   *
   * `mode` ne sert qu'à la hauteur d'ouverture : une capsule de saisie libre
   * naît à la taille de son champ, une capsule de capture réserve la hauteur
   * de travail de §4.3. Sans cette distinction la fenêtre apparaîtrait à 380
   * puis rétrécirait au premier rendu du renderer — le seul saut que
   * l'adaptation ne peut pas absorber, puisqu'il précède toute mesure.
   */
  show(anchor: CapsuleAnchor, mode: "capture" | "input"): void;
  /**
   * Donne à la capsule la hauteur demandée, bornée par l'écran.
   *
   * La position est recalculée depuis l'ancre mémorisée à l'ouverture, jamais
   * depuis la position courante : c'est ce qui empêche la fenêtre de dériver
   * d'un redimensionnement à l'autre. Le côté aussi est celui de l'ouverture,
   * donc la capsule grandit toujours du même bord.
   */
  resize(height: number): void;
  /**
   * La remontre là où elle était, sans la replacer.
   *
   * Sert au collage : la capsule est cachée pour rendre le focus clavier à
   * l'application source, puis ramenée telle quelle si le remplacement a
   * échoué — la déplacer au curseur, à ce moment-là, la ferait sauter.
   */
  reveal(): void;
  hide(): void;
}

/** Ce que l'ouverture a fixé pour toute la session, et rien d'autre. */
interface CapsuleFrame {
  anchor: CapsuleAnchor;
  side: CapsuleSide;
  workArea: WorkArea;
  height: number;
}

export function createCapsuleWindow(options: CapsuleWindowOptions): CapsuleWindow {
  const window = new BrowserWindow({
    width: CAPSULE_WIDTH,
    height: CAPSULE_HEIGHT,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    // macOS: panel behaviour + HUD vibrancy.
    type: "panel",
    vibrancy: "hud",
    webPreferences: {
      preload: options.preloadPath,
      // Non-negotiable (DESKTOP.md §2.3).
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Visible on every macOS space, like a HUD panel.
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // The capsule is transient: losing the focus dissolves it. The replacement
  // flow relies on this — the source app gets the focus back (§5.2).
  window.on("blur", () => {
    if (!window.webContents.isDevToolsOpened()) {
      window.hide();
    }
  });

  // esc / ⏎ call `window.close()` in the renderer: convert that into a hide.
  // Letting the window be destroyed would kill the NEXT shortcut trigger
  // ("Object has been destroyed" on show).
  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });

  void window.loadURL(options.devServerUrl ?? options.rendererUrl);

  /**
   * Le cadre de la session courante.
   *
   * Mémorisé plutôt que relu : `resize` ne doit dépendre ni du curseur, qui a
   * pu bouger depuis, ni de la position courante de la fenêtre, dont la
   * réutilisation ferait accumuler les calages.
   */
  let frame: CapsuleFrame | null = null;

  const apply = (next: CapsuleFrame): void => {
    const { x, y } = placeCapsuleOnSide(
      next.anchor,
      next.side,
      { width: CAPSULE_WIDTH, height: next.height },
      next.workArea,
    );
    window.setBounds({ x, y, width: CAPSULE_WIDTH, height: next.height });
  };

  return {
    window,
    notify(channel, payload) {
      if (window.isDestroyed()) {
        return;
      }
      window.webContents.send(channel, payload);
    },
    show(anchor, mode) {
      if (window.isDestroyed()) {
        return;
      }
      const referencePoint =
        anchor.kind === "cursor" ? anchor.point : screen.getCursorScreenPoint();
      const { workArea } = screen.getDisplayNearestPoint(referencePoint);
      frame = {
        anchor,
        // Le côté est arrêté avec la hauteur maximale de la session : décidé
        // avec la hauteur du moment, il basculerait dès que le résultat
        // s'allonge.
        side: resolveCapsuleSide(anchor, CAPSULE_MAX_HEIGHT, workArea),
        workArea,
        // Chaque déclenchement repart d'une hauteur connue : une session qui
        // hériterait de celle de la précédente s'ouvrirait à la taille d'un
        // résultat que plus rien ne montre.
        height: capsuleHeightFor(
          mode === "input" ? CAPSULE_INPUT_HEIGHT : CAPSULE_RESERVED_HEIGHT,
          workArea.height - 2 * EDGE_MARGIN,
        ),
      };
      apply(frame);
      window.show();
      window.focus();
    },
    resize(height) {
      if (window.isDestroyed() || frame === null) {
        return;
      }
      const bounded = capsuleHeightFor(height, frame.workArea.height - 2 * EDGE_MARGIN);
      if (bounded === frame.height) {
        return;
      }
      frame = { ...frame, height: bounded };
      apply(frame);
    },
    reveal() {
      if (window.isDestroyed()) {
        return;
      }
      window.show();
      window.focus();
    },
    hide() {
      if (!window.isDestroyed()) {
        window.hide();
      }
    },
  };
}
