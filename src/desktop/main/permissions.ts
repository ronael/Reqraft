import type { MacosBridge } from "./macos.js";

/**
 * Permissions probing (DESKTOP.md §5.9, updated after the spike).
 *
 * macOS gates the product behind TWO distinct permissions:
 *  - Accessibility — posting keystrokes, probed through
 *    `systemPreferences.isTrustedAccessibilityClient(false)` ;
 *  - Automation — addressing System Events via osascript.
 * One without the other fails with error -1002, so the report always says
 * WHICH one is missing.
 *
 * The app must work without them (§2.6): capture degrades to manual paste and
 * `⏎` copies instead of replacing. Under Wayland the injection is refused by
 * design (§5.4): the floor mode is the explicit behaviour, not a fallback.
 *
 * Electron-free by design: every probe is injected.
 */

export type PermissionGap = "none" | "accessibility" | "automation" | "both" | "wayland";

export interface PermissionsProbe {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** The real Accessibility check; never triggers the system prompt. */
  isTrustedAccessibilityClient(): boolean;
  hasAutomation(): Promise<boolean>;
}

export interface PermissionsReport {
  accessibility: boolean;
  automation: boolean;
  /** True when the full capture → replace cycle is possible. */
  canReplace: boolean;
  gap: PermissionGap;
  /** User-facing French message naming the missing permission. */
  message: string;
}

export function isWayland(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): boolean {
  return platform === "linux" && env.XDG_SESSION_TYPE === "wayland";
}

export async function probePermissions(probe: PermissionsProbe): Promise<PermissionsReport> {
  if (isWayland(probe.env, probe.platform)) {
    return {
      accessibility: false,
      automation: false,
      canReplace: false,
      gap: "wayland",
      message:
        "Wayland bloque l'injection de frappes par conception : la capsule fonctionne, mais ⏎ copie au lieu de remplacer.",
    };
  }

  if (probe.platform !== "darwin") {
    // Windows / X11: nothing to ask, injection is assumed available.
    return {
      accessibility: true,
      automation: true,
      canReplace: true,
      gap: "none",
      message: "Aucune permission requise sur cette plateforme.",
    };
  }

  const accessibility = probe.isTrustedAccessibilityClient();
  const automation = await probe.hasAutomation();
  const gap = macosGap(accessibility, automation);

  return {
    accessibility,
    automation,
    canReplace: accessibility && automation,
    gap,
    message: describeGap(gap),
  };
}

function macosGap(accessibility: boolean, automation: boolean): PermissionGap {
  if (accessibility && automation) {
    return "none";
  }
  if (accessibility) {
    return "automation";
  }
  if (automation) {
    return "accessibility";
  }
  return "both";
}

function describeGap(gap: PermissionGap): string {
  switch (gap) {
    case "none":
      return "Accessibilité et Automatisation accordées.";
    case "accessibility":
      return "Automatisation accordée, Accessibilité refusée — les frappes ne partiront pas.";
    case "automation":
      return "Accessibilité accordée, Automatisation refusée.";
    case "both":
      return "Aucune permission accordée : la capsule fonctionne en saisie manuelle.";
    case "wayland":
      return "Wayland bloque l'injection de frappes.";
  }
}

/** Narrow slice of Electron's `systemPreferences`, injected for testability. */
export interface SystemPreferencesLike {
  isTrustedAccessibilityClient(prompt: boolean): boolean;
}

/**
 * Triggers the macOS Accessibility prompt. Only ever called on explicit user
 * action, never at startup (§5.9). The answer arrives asynchronously — the
 * caller re-probes afterwards.
 */
export function requestAccessibility(systemPreferences: SystemPreferencesLike): void {
  systemPreferences.isTrustedAccessibilityClient(true);
}

/** Builds the probe for the real runtime, or a non-macOS equivalent. */
export function createSystemPermissionsProbe(
  systemPreferences: SystemPreferencesLike,
  bridge: MacosBridge,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): PermissionsProbe {
  return {
    platform,
    env,
    isTrustedAccessibilityClient: () =>
      platform === "darwin" ? systemPreferences.isTrustedAccessibilityClient(false) : true,
    hasAutomation: () => (platform === "darwin" ? bridge.hasAutomation() : Promise.resolve(true)),
  };
}
