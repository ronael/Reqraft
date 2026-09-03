import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import type { ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CAPSULE_INPUT_HEIGHT,
  CAPSULE_HEIGHT_STEP,
  CAPSULE_MAX_HEIGHT,
  CAPSULE_MIN_HEIGHT,
  CAPSULE_RESERVED_HEIGHT,
  CAPSULE_WIDTH,
} from "@/apps/desktop/shared/capsule-geometry.js";
import type { CapsuleMeasure, CapsuleUiReport } from "@/apps/desktop/main/e2e-capsule.js";

const electronPath =
  process.platform === "win32"
    ? path.resolve("node_modules/.bin/electron.cmd")
    : path.resolve("node_modules/.bin/electron");
const mainEntry = path.resolve("release/desktop/bundle/main/index.mjs");
const isCodexSeatbelt = process.env.CODEX_SANDBOX === "seatbelt";
const hasLinuxDisplay =
  process.env.DISPLAY !== undefined || process.env.WAYLAND_DISPLAY !== undefined;
const forceElectron = process.env.REQRAFT_DESKTOP_E2E_FORCE === "1";
function canRunElectronSuite(): boolean {
  if (!forceElectron && process.env.npm_lifecycle_event !== "test:desktop:e2e") return false;
  if (isCodexSeatbelt && !forceElectron) return false;
  if (process.platform === "linux" && !hasLinuxDisplay) return false;
  return true;
}
const canRunElectron = canRunElectronSuite();
const describeElectron = canRunElectron ? describe : describe.skip;
const ELECTRON_TEST_TIMEOUT_MS = 45_000;

interface DesktopE2ePayload {
  ready: boolean;
  platform: NodeJS.Platform;
  appName: string;
  version: string;
  windowCount: number;
  windows: { surface: string; destroyed: boolean; visible: boolean }[];
  shortcuts: {
    registered: {
      accelerator: string;
      label: string;
      intent: "capture" | "input" | "popover";
    }[];
    rejected: string[];
    conflicts: string[];
  };
  permissions: {
    accessibility: boolean;
    automation: boolean;
    canReplace: boolean;
    gap: string;
    message: string;
  };
  scenario?: {
    name: string;
    capsuleVisible?: boolean;
    capsuleMode?: string;
    popoverVisible?: boolean;
    popoverHidden?: boolean;
    shortcutsSuspended?: boolean;
    shortcutsResumed?: boolean;
    run?: { rewritten: string; model: string; profile: string };
    ui?: CapsuleUiReport;
    menuAccelerators?: string[];
    error?: string;
  };
}

/** La configuration minimale qui laisse un run partir, sans clé ni réseau. */
const MOCK_CONFIG = {
  defaultProvider: "mock",
  defaultModel: "mock-model",
  defaultProfile: "writing",
  defaultLevel: "standard",
  telemetry: false,
};

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryHomes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createIsolatedHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "reqraft-desktop-e2e-"));
  temporaryHomes.push(directory);
  return directory;
}

/**
 * Une configuration écrite avant le démarrage.
 *
 * Sans elle, l'application considère l'installation à faire et ouvre
 * l'onboarding : aucun run ne peut partir. Le fournisseur `mock` ne demande ni
 * clé ni réseau, ce qui rend le scénario reproductible partout.
 */
async function writeConfig(home: string, config: Record<string, unknown>): Promise<void> {
  // La même règle que `src/config/paths.ts`, à la main : la calculer ici avec
  // le `os.homedir()` du processus de test donnerait le dossier de la vraie
  // installation, pas celui du HOME isolé passé à l'enfant.
  const directory =
    process.platform === "darwin"
      ? path.join(home, "Library", "Application Support", "rp")
      : path.join(home, ".config", "rp");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "config.json"), JSON.stringify(config), "utf8");
}

/**
 * Lance le bundle desktop réel dans un HOME isolé.
 *
 * Deux isolations, pas une : `HOME` déplace la configuration, et
 * `--user-data-dir` déplace le verrou d'instance unique — que `userData` ne
 * suit pas sur macOS. Sans le second, la nouvelle instance partage le verrou,
 * quitte en silence avec le code 0, et le test croit à un crash muet.
 */
function spawnDesktop(
  home: string,
  userDataDir: string,
  extraEnv: NodeJS.ProcessEnv,
): ChildProcessByStdio<null, Readable, Readable> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
  };
  delete env.ELECTRON_RUN_AS_NODE;

  return spawn(electronPath, [mainEntry, `--user-data-dir=${userDataDir}`], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function waitForReadiness(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 40_000,
): Promise<DesktopE2ePayload> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(new Error(`desktop probe timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      });
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout
        .split(/\r?\n/)
        .find((candidate) => candidate.startsWith("REQRAFT_DESKTOP_E2E_READY "));
      if (line !== undefined) {
        finish(() => {
          resolve(JSON.parse(line.slice("REQRAFT_DESKTOP_E2E_READY ".length)) as DesktopE2ePayload);
        });
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      finish(() => {
        reject(error);
      });
    });
    child.on("exit", (code, signal) => {
      finish(() => {
        const status = code === null ? (signal ?? "unknown") : String(code);
        reject(
          new Error(
            `desktop probe exited without readiness line (${status})\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          ),
        );
      });
    });
  });
}

function waitForExit(
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs = 15_000,
): Promise<{ code: number | null; stdout: string }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, stdout: "" });
  }
  return new Promise((resolve, reject) => {
    let stdout = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("desktop process did not exit"));
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout });
    });
  });
}

async function terminate(child: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function runDesktopProbe(
  extraEnv: NodeJS.ProcessEnv = {},
  config?: Record<string, unknown>,
): Promise<DesktopE2ePayload> {
  expect(existsSync(mainEntry), `${mainEntry} is missing; run pnpm build:desktop first`).toBe(true);

  const home = await createIsolatedHome();
  if (config !== undefined) {
    await writeConfig(home, config);
  }

  const child = spawnDesktop(home, path.join(home, "electron"), {
    ...extraEnv,
    REQRAFT_DESKTOP_E2E_PROBE: "1",
  });
  const payload = await waitForReadiness(child);
  await waitForExit(child);
  return payload;
}

describeElectron("desktop Electron smoke", () => {
  it(
    "starts the built desktop bundle and creates the durable hidden windows",
    async () => {
      const payload = await runDesktopProbe();

      expect(payload.ready).toBe(true);
      expect(payload.appName).toBe("Reqraft");
      expect(payload.windowCount).toBeGreaterThanOrEqual(2);
      expect(payload.windows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ surface: "capsule", destroyed: false, visible: false }),
          expect.objectContaining({ surface: "popover", destroyed: false }),
        ]),
      );
      expect(
        payload.shortcuts.registered
          .map((shortcut) => shortcut.intent)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual(["capture", "input", "popover"]);
      expect(payload.shortcuts.conflicts).toEqual([]);
      expect(payload.permissions.message.length).toBeGreaterThan(0);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "toggles the popover through its global shortcut handler",
    async () => {
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_SCENARIO: "popover" });

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.popoverVisible).toBe(true);
      expect(payload.scenario?.popoverHidden).toBe(true);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "suspends and resumes every registered global shortcut",
    async () => {
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_SCENARIO: "suspension" });

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.shortcutsSuspended).toBe(true);
      expect(payload.scenario?.shortcutsResumed).toBe(true);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "opens the capsule through the input shortcut handler",
    async () => {
      // Le handler utilisé par le raccourci global est exercé dans le vrai bundle,
      // mais sans envoyer de frappe ni modifier le presse-papiers de la machine.
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_SCENARIO: "capsule" });

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.capsuleVisible).toBe(true);
      expect(payload.scenario?.capsuleMode).toBe("input");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "runs a full reprompt through the real main-process service",
    async () => {
      const payload = await runDesktopProbe(
        { REQRAFT_DESKTOP_E2E_SCENARIO: "run" },
        {
          defaultProvider: "mock",
          defaultModel: "mock-model",
          defaultProfile: "writing",
          defaultLevel: "standard",
          telemetry: false,
        },
      );

      expect(payload.scenario?.error).toBeUndefined();
      expect(payload.scenario?.run?.rewritten).toContain("[mock]");
      expect(payload.scenario?.run?.model).toBe("mock-model");
      expect(payload.scenario?.run?.profile).toBe("writing");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "reports which macOS permission is missing instead of a bare boolean",
    async () => {
      // §5.9 : Accessibilité et Automatisation se demandent séparément, et le
      // message doit dire laquelle manque — sinon on envoie l'utilisateur dans
      // le mauvais panneau des Réglages Système.
      const payload = await runDesktopProbe();

      expect(["none", "accessibility", "automation", "both", "wayland"]).toContain(
        payload.permissions.gap,
      );
      if (payload.permissions.canReplace) {
        expect(payload.permissions.gap).toBe("none");
      } else {
        expect(payload.permissions.message).toMatch(/Accessibility|Automation|Wayland/);
      }
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it("refuses to start a second instance instead of fighting for the shortcut", async () => {
    // §5.8 : deux instances se disputeraient le raccourci global, et la
    // seconde enregistrée gagnerait sans que rien ne le dise. Le verrou doit
    // donc faire quitter la seconde — le même verrou dont dépend l'isolation
    // des instances de test, qui échoue en silence avec le code 0 quand on
    // oublie `--user-data-dir`.
    const home = await createIsolatedHome();
    const userDataDir = path.join(home, "electron");
    const first = spawnDesktop(home, userDataDir, {
      REQRAFT_DESKTOP_E2E_PROBE: "1",
      REQRAFT_DESKTOP_E2E_HOLD: "1",
    });
    try {
      // La disponibilité prouve que la première a pris le verrou et terminé son
      // démarrage. Aucun délai lié à la vitesse de la machine.
      await waitForReadiness(first);
      expect(first.exitCode, "la première instance ne doit pas avoir quitté").toBeNull();

      const second = spawnDesktop(home, userDataDir, { REQRAFT_DESKTOP_E2E_PROBE: "1" });
      const outcome = await waitForExit(second);

      expect(outcome.code).toBe(0);
      // Elle quitte avant `bootstrap` : aucune ligne de disponibilité, donc
      // aucune fenêtre ni raccourci enregistré.
      expect(outcome.stdout).not.toContain("REQRAFT_DESKTOP_E2E_READY");
    } finally {
      await terminate(first);
    }
  }, 60_000);

  it(
    "surfaces rejected global shortcuts without crashing startup",
    async () => {
      const payload = await runDesktopProbe({ REQRAFT_DESKTOP_E2E_REJECT_SHORTCUTS: "1" });

      expect(payload.ready).toBe(true);
      expect(payload.shortcuts.registered).toEqual([]);
      expect(payload.shortcuts.rejected).toEqual([
        "Command+Control+R",
        "Command+Control+N",
        "Command+Control+O",
        "Command+Control+J",
        "Command+Control+K",
        "Command+Control+T",
      ]);
      expect(payload.shortcuts.conflicts).toEqual([]);
      expect(payload.windowCount).toBeGreaterThanOrEqual(2);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );
});

/**
 * La géométrie de la capsule, mesurée dans le vrai renderer.
 *
 * Ces cas ne relisent aucune feuille de style : le processus principal ouvre la
 * vraie fenêtre, la pilote, et rend les rectangles que le moteur de rendu a
 * calculés à 560 px de large. C'est la seule façon de prouver qu'un pied tient
 * dans une fenêtre de 172 px — une règle CSS ne le dit pas.
 */
describeElectron("capsule — géométrie et clavier dans la vraie fenêtre", () => {
  /**
   * Une seule campagne de mesures pour tous les cas.
   *
   * Le scénario enchaîne onze états dans la vraie fenêtre : le relancer par
   * assertion coûterait une minute de plus sans rien prouver de neuf. Les cas
   * qui suivent lisent chacun une facette du même relevé.
   */
  let campagne: Promise<{ ui: CapsuleUiReport; menuAccelerators: string[] }> | null = null;

  function releve(): Promise<{ ui: CapsuleUiReport; menuAccelerators: string[] }> {
    campagne ??= runDesktopProbe({ REQRAFT_DESKTOP_E2E_SCENARIO: "capsule-ui" }, MOCK_CONFIG).then(
      (payload) => {
        expect(payload.scenario?.error).toBeUndefined();
        const ui = payload.scenario?.ui;
        if (ui === undefined) throw new Error("le scénario n'a rendu aucune mesure");
        return { ui, menuAccelerators: payload.scenario?.menuAccelerators ?? [] };
      },
    );
    return campagne;
  }

  async function capsuleUi(): Promise<CapsuleUiReport> {
    return (await releve()).ui;
  }

  function byName(ui: CapsuleUiReport, name: string): CapsuleMeasure {
    const found = ui.measures.find((measure) => measure.name === name);
    if (found === undefined) throw new Error(`mesure « ${name} » absente`);
    return found;
  }

  it(
    "adapte sa hauteur à chaque état posé, sans jamais perdre son pied",
    async () => {
      const ui = await capsuleUi();

      for (const measure of ui.measures) {
        expect(measure.window.width, measure.name).toBe(CAPSULE_WIDTH);
        expect(measure.window.height, measure.name).toBeGreaterThanOrEqual(CAPSULE_MIN_HEIGHT);
        expect(measure.window.height, measure.name).toBeLessThanOrEqual(CAPSULE_MAX_HEIGHT);
        // §4.3 : le pied porte le verdict et les commandes. Une capsule dont
        // le pied passe sous le bord est une capsule sans issue.
        expect(measure.footerVisible, `${measure.name} : pied hors de la fenêtre`).toBe(true);
        expect(measure.footer.height, measure.name).toBeGreaterThan(0);
      }

      const court = byName(ui, "short");
      const moyen = byName(ui, "medium");
      const long = byName(ui, "long");

      // Un résultat court ne laisse pas un demi-écran de vide : c'est tout
      // l'objet de l'adaptation.
      expect(court.window.height).toBeLessThan(CAPSULE_RESERVED_HEIGHT);
      expect(court.body.overflows).toBe(false);
      expect(court.window.height - court.naturalHeight).toBeLessThan(CAPSULE_HEIGHT_STEP);

      // Chaque taille de contenu a sa hauteur, dans l'ordre.
      expect(moyen.window.height).toBeGreaterThan(court.window.height);
      expect(long.window.height).toBeGreaterThan(moyen.window.height);

      // Un résultat long est borné et défile : la capsule reste une capsule.
      expect(long.window.height).toBe(CAPSULE_MAX_HEIGHT);
      expect(long.body.overflows).toBe(true);
      expect(long.naturalHeight).toBeGreaterThan(CAPSULE_MAX_HEIGHT);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "ouvre la saisie libre à la hauteur annoncée, sans rétrécir après coup",
    async () => {
      const ui = await capsuleUi();
      const saisie = byName(ui, "input");

      // La constante sert à ouvrir la fenêtre AVANT que le renderer n'ait
      // mesuré quoi que ce soit. Si elle s'écarte du rendu réel, la capsule
      // apparaît puis saute — et ce test est ce qui l'annonce.
      expect(Math.abs(saisie.window.height - CAPSULE_INPUT_HEIGHT)).toBeLessThanOrEqual(
        CAPSULE_HEIGHT_STEP,
      );
      expect(saisie.body.overflows).toBe(false);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "ne bouge pas d'un pixel pendant qu'on édite le résultat",
    async () => {
      const ui = await capsuleUi();
      const avant = byName(ui, "short-again");
      const pendant = byName(ui, "editing-short");
      const apres = byName(ui, "edited-short-blurred");

      // Quatorze lignes collées dans une capsule de 172 px : le corps défile,
      // la fenêtre ne bronche pas. C'est la règle qui remplace le
      // `ResizeObserver` du POC, et elle se vérifie ici, pas en relisant du code.
      expect(pendant.window).toEqual(avant.window);
      expect(pendant.naturalHeight).toBeGreaterThan(pendant.window.height);
      expect(pendant.body.overflows).toBe(true);
      expect(pendant.footerVisible).toBe(true);

      // Puis, une seule fois, quand le champ rend la main.
      expect(apres.window.height).toBeGreaterThan(pendant.window.height);

      // Même chose sur un résultat déjà au plafond : rien à gagner, rien qui bouge.
      expect(byName(ui, "editing-long").window).toEqual(byName(ui, "long").window);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "retrouve exactement ses bornes après un aller-retour de comparaison",
    async () => {
      const ui = await capsuleUi();

      // La dérive est le défaut classique d'une fenêtre qui se replace à partir
      // de sa position courante : chaque cycle la décale un peu plus. La
      // position est ici recalculée depuis l'ancre de la session.
      expect(byName(ui, "long-again").window).toEqual(byName(ui, "long").window);
      expect(byName(ui, "short-again").window).toEqual(byName(ui, "short").window);
      expect(byName(ui, "comparison").body.scrollTop).toBe(0);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "garde l'annonce dans la fenêtre et au-dessus du pied, à toutes les tailles",
    async () => {
      const ui = await capsuleUi();
      const annonces = ui.measures.filter((measure) => measure.name.endsWith("-toast"));

      expect(annonces.length).toBeGreaterThanOrEqual(3);
      for (const measure of annonces) {
        const toast = measure.toast;
        expect(toast, `${measure.name} : aucune annonce affichée`).not.toBeNull();
        if (toast === null) continue;
        expect(toast.top, measure.name).toBeGreaterThanOrEqual(0);
        expect(toast.bottom, measure.name).toBeLessThanOrEqual(measure.window.height);
        // Au-dessus du pied, jamais dessous : recouverte, elle ne sert à rien.
        expect(toast.bottom, measure.name).toBeLessThanOrEqual(measure.footer.top);
      }
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "ne recharge pas la fenêtre quand ⌘R arrive pendant l'édition",
    async () => {
      const ui = await capsuleUi();

      // Le rechargement jetterait le texte corrigé sans un mot. La frappe est
      // envoyée à la fenêtre réelle, et le marqueur posé dans la page prouve
      // que le document n'a pas été rejoué.
      expect(ui.reloadedOnRerunShortcut).toBe(false);
      expect(ui.textAfterRerunShortcut).toContain("ligne editee 14");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "ne laisse aucun raccourci de menu confisquer ⌘R ni déformer la capsule",
    async () => {
      const { menuAccelerators: accelerators } = await releve();

      // Le menu par défaut d'Electron porte « Recharger ⌘R », et un raccourci
      // de menu passe AVANT le renderer sur macOS : aucun `preventDefault` de
      // la capsule ne peut l'arrêter. Le menu posé par l'application ne doit
      // donc pas le contenir — ni le zoom, qui déforme une géométrie calculée
      // à 560 px.
      expect(accelerators.length, "aucun menu applicatif installé").toBeGreaterThan(0);
      for (const entry of accelerators) {
        const [role = "", accelerator = ""] = entry.split(":");
        expect(["reload", "forcereload", "resetzoom", "zoomin", "zoomout"]).not.toContain(
          role.toLowerCase(),
        );
        expect(accelerator.replace("CommandOrControl", "CmdOrCtrl"), entry).not.toBe("CmdOrCtrl+R");
      }
      // Le menu Édition reste entier : ⌘C, ⌘V et ⌘A des champs en dépendent.
      expect(accelerators).toContain("copy:CommandOrControl+C");
      expect(accelerators).toContain("paste:CommandOrControl+V");
      expect(accelerators).toContain("selectall:CommandOrControl+A");
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );

  it(
    "resserre aussi l'écran d'erreur, plutôt que de l'étaler sur la hauteur de travail",
    async () => {
      const payload = await runDesktopProbe(
        { REQRAFT_DESKTOP_E2E_SCENARIO: "capsule-error" },
        {
          ...MOCK_CONFIG,
          defaultProvider: "openai",
          defaultModel: "gpt-4o-mini",
        },
      );

      expect(payload.scenario?.error).toBeUndefined();
      const erreur = payload.scenario?.ui?.measures[0];
      expect(erreur, "mesure d'erreur absente").toBeDefined();
      if (erreur === undefined) return;
      expect(erreur.name).toBe("error");
      expect(erreur.window.height).toBeLessThan(CAPSULE_RESERVED_HEIGHT);
      expect(erreur.footerVisible).toBe(true);
      expect(erreur.body.overflows).toBe(false);
    },
    ELECTRON_TEST_TIMEOUT_MS,
  );
});
