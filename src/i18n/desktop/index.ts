import type { UiLocale } from "@/i18n/locale.js";
import { DESKTOP_EN } from "./en.js";
import { DESKTOP_FR } from "./fr.js";
export { formatMessage, type Translate } from "./format.js";
import { formatMessage, type Translate } from "./format.js";

/**
 * Le catalogue de l'application desktop.
 *
 * Séparé de `messages/` parce qu'il traverse l'IPC : des chaînes simples se
 * sérialisent, des fonctions non. Les clés des deux langues sont vérifiées par
 * un test — sans lui, une langue se dégraderait en silence.
 */
export type DesktopMessageKey = keyof typeof DESKTOP_EN;

export const DESKTOP_MESSAGES: Record<UiLocale, Record<string, string>> = {
  en: DESKTOP_EN,
  fr: DESKTOP_FR,
};

/**
 * Un traducteur sur ce catalogue, pour le processus principal.
 *
 * Le renderer, lui, reçoit les libellés déjà résolus par IPC : il n'a pas de
 * catalogue embarqué, sinon la résolution de langue existerait en deux
 * exemplaires et finirait par diverger.
 */
export function createDesktopTranslator(locale: UiLocale): Translate {
  const messages = DESKTOP_MESSAGES[locale];
  return (key, params) => formatMessage(messages[key] ?? key, params);
}
