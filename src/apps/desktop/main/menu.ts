/**
 * Le menu applicatif, posé explicitement.
 *
 * Electron installe un menu par défaut quand l'application n'en pose aucun.
 * Sur macOS ce menu détient `⌘R` (Recharger), `⇧⌘R` (Recharger sans le cache)
 * et `⌥⌘I` (Outils de développement) — et un raccourci de menu est traité par
 * le système AVANT que la frappe n'atteigne la page. Aucun `preventDefault` du
 * renderer ne peut l'arrêter.
 *
 * Trois conséquences, toutes mesurées sur le menu réel :
 *
 * - `⌘R` est déjà la commande « relancer » de la capsule. Partagée avec un
 *   accélérateur de menu, la relance devient un rechargement de fenêtre.
 * - Pendant l'édition du résultat, la capsule suspend ses propres commandes
 *   pour rendre les touches au champ. Un rechargement à cet instant jette le
 *   texte corrigé, sans un mot.
 * - Le zoom (`⌘0`, `⌘+`, `⌘-`) déforme une fenêtre dont toute la géométrie est
 *   calculée à 560 px de large.
 *
 * Le menu Édition est conservé intégralement, et ce n'est pas cosmétique : sur
 * macOS, `⌘C`, `⌘V`, `⌘A` et l'annulation dans un champ de texte passent par
 * les rôles de ce menu. Le supprimer casserait la saisie dans les réglages,
 * l'onboarding et la capsule elle-même.
 */

export interface MenuTemplateItem {
  role?: string;
  label?: string;
  submenu?: MenuTemplateItem[];
}

export interface MenuFactory {
  buildFromTemplate(template: MenuTemplateItem[]): unknown;
  setApplicationMenu(menu: unknown): void;
}

/**
 * Le gabarit du menu, testable sans Electron.
 *
 * `viewMenu` est volontairement absent, et `toggleDevTools` ne revient qu'en
 * développement : il n'a pas d'accélérateur qui entre en conflit avec une
 * commande de la capsule, mais il n'a rien à faire dans un produit livré.
 */
export function desktopMenuTemplate(options: { devTools: boolean }): MenuTemplateItem[] {
  return [
    { role: "appMenu" },
    { role: "editMenu" },
    ...(options.devTools ? [{ label: "Developer", submenu: [{ role: "toggleDevTools" }] }] : []),
    { role: "windowMenu" },
  ];
}

/** Les rôles qu'aucun menu Reqraft ne doit porter, quelle que soit la plateforme. */
export const FORBIDDEN_MENU_ROLES: readonly string[] = [
  "reload",
  "forceReload",
  "resetZoom",
  "zoomIn",
  "zoomOut",
];

export function installDesktopMenu(menu: MenuFactory, options: { devTools: boolean }): void {
  menu.setApplicationMenu(menu.buildFromTemplate(desktopMenuTemplate(options)));
}
