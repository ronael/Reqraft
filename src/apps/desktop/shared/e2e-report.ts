import type { ShortcutIntent } from "./ipc-contract.js";

/**
 * Ce que la sonde e2e du processus principal écrit sur `stdout`, décrit une
 * seule fois.
 *
 * La ligne `REQRAFT_DESKTOP_E2E_READY` est un format entre deux processus : le
 * bundle Electron l'écrit, la suite `tests/e2e/desktop.test.ts` la relit. Les
 * deux côtés en portaient chacun leur propre description — l'un dans
 * `main/e2e-probe.ts`, l'autre recopié en tête du fichier de test — et rien ne
 * les empêchait de diverger : un champ ajouté d'un côté restait invisible de
 * l'autre jusqu'à ce qu'une assertion échoue sans expliquer pourquoi.
 *
 * Ce module ne contient que des formes de données. Aucun import Electron,
 * aucun import Node : ni le principal ni les tests n'ont à charger quoi que ce
 * soit d'exécutable pour se mettre d'accord sur ce format. Ce qui pilote les
 * fenêtres (`CapsuleUiWindow`, les cibles de scénario) reste dans `main/`, où
 * il s'exécute.
 */

/** Un rectangle tel que le moteur de rendu le donne, arrondi au pixel. */
export interface Rect {
  top: number;
  bottom: number;
  height: number;
}

/** Ce qu'un état de la capsule occupe réellement à l'écran. */
export interface CapsuleMeasure {
  name: string;
  window: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  band: Rect;
  footer: Rect;
  bar: Rect;
  body: { clientHeight: number; scrollHeight: number; scrollTop: number; overflows: boolean };
  /**
   * La hauteur que le contenu demanderait sans borne.
   *
   * C'est l'entrée d'une décision de hauteur adaptative : bandeau + barre +
   * corps déroulé + pied. Elle est prise dans le rendu réel, jamais estimée à
   * partir d'un nombre de caractères.
   */
  naturalHeight: number;
  /** Le pied tient-il entièrement dans la fenêtre ? */
  footerVisible: boolean;
  /** Le vide sous le contenu quand il n'occupe pas toute la hauteur offerte. */
  slack: number;
  toast: Rect | null;
  /** Le fichier PNG écrit pour cet état, quand les captures sont demandées. */
  shot?: string;
}

export interface CapsuleUiReport {
  measures: CapsuleMeasure[];
  /** `⌘R` pendant l'édition a-t-il rechargé la fenêtre ? */
  reloadedOnRerunShortcut: boolean;
  /** Le nombre de runs ouverts après la frappe : la relance a-t-elle eu lieu ? */
  textAfterRerunShortcut: string;
  error?: string;
}

/** Ce qu'un état du popover occupe réellement à l'écran. */
export interface PopoverMeasure {
  name: string;
  window: { width: number; height: number };
  viewport: { width: number; height: number };
  prompt: Rect;
  content: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    /** Le contenu déborde en hauteur, donc il défile. */
    overflows: boolean;
    /** Il déborde en largeur : un texte long coupé sur le bord droit. */
    overflowsSideways: boolean;
  };
  footer: Rect;
  copy: Rect | null;
  /** Le pied tient-il entièrement dans la fenêtre ? */
  footerVisible: boolean;
  /** L'action de copie est-elle atteignable, et au bon endroit ? */
  copyVisible: boolean;
  copyInFooter: boolean;
  copyInContent: boolean;
  /** Le texte que le champ du résultat porte, ou `null` s'il n'existe pas. */
  resultValue: string | null;
  /** Le résultat défile avec le contenu ; le prompt reste hors de cette zone. */
  resultInContent: boolean;
  promptInContent: boolean;
  toast: Rect | null;
  /** La page elle-même déborde-t-elle de la fenêtre ? Elle ne doit jamais. */
  documentOverflows: boolean;
  /** Le fichier PNG écrit pour cet état, quand les captures sont demandées. */
  shot?: string;
}

export interface PopoverUiReport {
  measures: PopoverMeasure[];
  /** `⌘⏎` depuis le champ du résultat a-t-il rechargé la fenêtre ? */
  reloadedOnRerunShortcut: boolean;
  /** Le prompt tel qu'il est resté après la relance au clavier. */
  promptAfterRerun: string;
}

export interface DiagnosticUiReport {
  window: { width: number; height: number };
  failedChecks: number;
  actions: number;
  summaryGap: number;
  rerunVisible: boolean;
  statusbarVisible: boolean;
  documentOverflows: boolean;
  shot?: string;
}

export interface PreferencesUiReport {
  window: { width: number; height: number };
  generationRows: number;
  generationVisible: boolean;
  customLanguageVisible: boolean;
  panelOverflowsHorizontally: boolean;
  shot?: string;
}

export interface E2eScenarioReport {
  name: string;
  capsuleVisible?: boolean;
  capsuleMode?: string;
  /** Le popover après le premier appui, puis après le second : une bascule. */
  popoverVisible?: boolean;
  popoverHidden?: boolean;
  shortcutsSuspended?: boolean;
  shortcutsResumed?: boolean;
  run?: { rewritten: string; model: string; profile: string };
  /** Les mesures prises dans le vrai renderer (scénarios `capsule-ui*`). */
  ui?: CapsuleUiReport;
  popoverUi?: PopoverUiReport;
  diagnosticUi?: DiagnosticUiReport;
  preferencesUi?: PreferencesUiReport;
  /** Les accélérateurs que le menu applicatif détient réellement. */
  menuAccelerators?: string[];
  error?: string;
}

/** Une fenêtre de l'inventaire pris juste avant que l'application se retire. */
export interface DesktopE2eWindowInfo {
  surface: string;
  destroyed: boolean;
  visible: boolean;
}

/**
 * Les raccourcis globaux tels que l'enregistrement les a laissés.
 *
 * Même forme que `ShortcutResolution` côté principal, sans en dépendre : ce
 * module ne doit rien importer de `main/`, qui parle à Electron.
 */
export interface DesktopE2eShortcutsInfo {
  registered: { accelerator: string; label: string; intent: ShortcutIntent }[];
  rejected: string[];
  conflicts: string[];
}

/**
 * Les permissions telles que la sonde les a trouvées.
 *
 * `gap` et `message` restent des chaînes : le premier est un identifiant que
 * `main/permissions.ts` énumère, le second une phrase traduite. Les figer ici
 * ferait dépendre le format d'un module qui appelle Electron.
 */
export interface DesktopE2ePermissionsInfo {
  accessibility: boolean;
  automation: boolean;
  canReplace: boolean;
  gap: string;
  message: string;
}

/** La ligne `REQRAFT_DESKTOP_E2E_READY`, en entier. */
export interface DesktopE2eReadyPayload {
  ready: boolean;
  platform: NodeJS.Platform;
  appName: string;
  version: string;
  windowCount: number;
  windows: DesktopE2eWindowInfo[];
  shortcuts: DesktopE2eShortcutsInfo;
  permissions: DesktopE2ePermissionsInfo;
  scenario?: E2eScenarioReport;
}
