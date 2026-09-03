import type { DoctorRemedy } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Ce qu'un contrôle en échec propose de faire, tout de suite.
 *
 * Le processus principal dit *pourquoi* un contrôle échoue (`DoctorCheck.remedy`) ;
 * ce module dit ce que l'onglet en montre : une phrase, et les commandes que
 * le desktop sait réellement exécuter. La table est une donnée pure, donc
 * vérifiable sans DOM — un bouton qui ne mènerait nulle part se voit ici, pas
 * à l'écran.
 *
 * Deux règles tenues par cette table :
 *
 * - aucune action factice. Un remède sans capacité correspondante (la
 *   permission Automatisation refusée avant même que macOS ne l'ait demandée,
 *   le mode plancher sous Wayland) porte une instruction courte et rien
 *   d'autre. Un bouton qui n'agit pas coûte plus cher que pas de bouton ;
 * - aucune consigne CLI. Tout ce qui est proposé ici existe dans
 *   l'application : une commande directe, ou un autre onglet de cette fenêtre.
 */

/** Les onglets vers lesquels un échec peut renvoyer. */
export type DiagnosticTarget = "preferences" | "providers";

/**
 * Ce qu'un bouton de remède déclenche.
 *
 * Un identifiant, pas une fonction : la table reste une donnée, et l'onglet
 * reste le seul endroit qui touche à `window.reqraft`.
 */
export type DiagnosticActionKind =
  /** `permissions:request` — l'invite macOS Accessibilité. */
  | "request-permissions"
  /** `system:open-permission-settings` sur le volet Accessibilité. */
  | "open-accessibility-settings"
  /** Le même canal, volet Automatisation. */
  | "open-automation-settings"
  /** `shortcuts:resume` — lève la suspension venue du menu de la barre. */
  | "resume-shortcuts"
  /** Navigation interne : l'onglet Réglages, où se changent les combinaisons. */
  | "open-shortcuts"
  /** Navigation interne : l'onglet Providers, clés et endpoints. */
  | "open-providers";

export interface DiagnosticAction {
  kind: DiagnosticActionKind;
  labelKey: string;
  /** Une seule action mise en avant par ligne ; les autres restent neutres. */
  primary: boolean;
}

export interface DiagnosticRemedyView {
  /** La phrase « prochaine action », toujours présente. */
  guidanceKey: string;
  /** Les commandes directes, éventuellement aucune. */
  actions: readonly DiagnosticAction[];
}

const OPEN_SYSTEM_SETTINGS_KEY = "settings.remedy.openSystemSettings";
const OPEN_SHORTCUTS_KEY = "settings.remedy.openShortcuts";

/** Trois échecs de raccourci différents, une seule commande pour les traiter. */
const OPEN_SHORTCUTS: DiagnosticActionKind = "open-shortcuts";

/** La seule action qui fait le tour du contrat : la même à déclarer et à lire. */
const OPEN_SHORTCUTS_ACTION: DiagnosticAction = {
  kind: OPEN_SHORTCUTS,
  labelKey: OPEN_SHORTCUTS_KEY,
  primary: true,
};

const REMEDIES: Record<DoctorRemedy, DiagnosticRemedyView> = {
  // L'invite d'abord, le volet système ensuite : macOS n'affiche l'invite
  // qu'une fois par installation, et après un refus elle ne revient plus. Sans
  // le second bouton, le premier serait un bouton mort pour toute personne
  // ayant déjà cliqué « Refuser ».
  "grant-accessibility": {
    guidanceKey: "settings.remedy.grantAccessibility",
    actions: [
      { kind: "request-permissions", labelKey: "settings.allow", primary: true },
      { kind: "open-accessibility-settings", labelKey: OPEN_SYSTEM_SETTINGS_KEY, primary: false },
    ],
  },
  // Aucune invite ici : l'Automatisation se demande au premier `osascript`, et
  // rien dans Electron ne la redemande. Le volet système est la seule suite.
  "grant-automation": {
    guidanceKey: "settings.remedy.grantAutomation",
    actions: [
      { kind: "open-automation-settings", labelKey: OPEN_SYSTEM_SETTINGS_KEY, primary: true },
    ],
  },
  // Conséquence des deux lignes précédentes : elles portent déjà les boutons,
  // et les répéter ferait croire à trois corrections pour un seul problème.
  "grant-permissions": {
    guidanceKey: "settings.remedy.grantPermissions",
    actions: [],
  },
  // Wayland refuse l'injection par conception : il n'y a rien à autoriser, et
  // le comportement de repli est le comportement définitif sur cette session.
  "wayland-floor": {
    guidanceKey: "settings.remedy.waylandFloor",
    actions: [],
  },
  "pick-shortcut": {
    guidanceKey: "settings.remedy.pickShortcut",
    actions: [OPEN_SHORTCUTS_ACTION],
  },
  "free-shortcut": {
    guidanceKey: "settings.remedy.freeShortcut",
    actions: [OPEN_SHORTCUTS_ACTION],
  },
  "resolve-shortcut-conflict": {
    guidanceKey: "settings.remedy.resolveShortcutConflict",
    actions: [OPEN_SHORTCUTS_ACTION],
  },
  "resume-shortcuts": {
    guidanceKey: "settings.remedy.resumeShortcuts",
    actions: [{ kind: "resume-shortcuts", labelKey: "settings.remedy.resume", primary: true }],
  },
  "configure-provider": {
    guidanceKey: "settings.remedy.configureProvider",
    actions: [
      { kind: "open-providers", labelKey: "settings.remedy.openProviders", primary: false },
    ],
  },
};

/**
 * Le remède affichable d'un contrôle, ou rien.
 *
 * Rien couvre deux cas volontairement identiques à l'écran : un contrôle qui
 * passe, et un contrôle en échec pour une raison que cette version ne sait pas
 * encore réparer — un futur `doctor` peut ajouter une vérification avant que
 * l'interface n'ait appris quoi en faire. Les deux affichent leur détail et
 * s'arrêtent là, plutôt qu'une phrase creuse.
 */
export function diagnosticRemedy(
  remedy: DoctorRemedy | undefined,
): DiagnosticRemedyView | undefined {
  return remedy === undefined ? undefined : REMEDIES[remedy];
}

/** Le volet système visé par une action, quand elle en vise un. */
export function permissionPaneOf(
  kind: DiagnosticActionKind,
): "accessibility" | "automation" | null {
  if (kind === "open-accessibility-settings") return "accessibility";
  if (kind === "open-automation-settings") return "automation";
  return null;
}

/** L'onglet visé par une action de navigation, quand elle en vise un. */
export function targetTabOf(kind: DiagnosticActionKind): DiagnosticTarget | null {
  if (kind === OPEN_SHORTCUTS) return "preferences";
  if (kind === "open-providers") return "providers";
  return null;
}
