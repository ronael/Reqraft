import { createDesktopTranslator, type Translate } from "@/i18n/desktop/index.js";
import { resolveUiLocale, systemLocaleCandidates, type UiLocale } from "@/i18n/locale.js";

/**
 * La langue du processus principal.
 *
 * Le menu de la barre, l'infobulle, les messages de permission et les erreurs
 * levées par l'IPC sont écrits ici puis lus dans le renderer : les faire
 * traverser en clair est le seul moyen de ne pas dupliquer le catalogue côté
 * fenêtre. La langue est résolue une fois au démarrage — la changer demande un
 * redémarrage, comme le prévoit le réglage.
 *
 * L'anglais est en place avant même la lecture de la configuration : un
 * démarrage qui échoue doit encore pouvoir dire pourquoi.
 */
let current: Translate = createDesktopTranslator("en");
let currentLocale: UiLocale = "en";

export function setMainLocale(locale: UiLocale): void {
  currentLocale = locale;
  current = createDesktopTranslator(locale);
}

export function mainLocale(): UiLocale {
  return currentLocale;
}

/** Le traducteur du processus principal, stable à l'import. */
export const t: Translate = (key, params) => current(key, params);

/** La langue déduite de la configuration, de l'environnement puis du système. */
export function resolveMainLocale(
  configuredLocale: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): UiLocale {
  return resolveUiLocale({
    config: configuredLocale,
    env: env.REQRAFT_UI_LOCALE,
    systemLocales: systemLocaleCandidates(env),
  });
}
