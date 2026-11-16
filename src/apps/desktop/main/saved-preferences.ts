import type { ConfigWriteRequest } from "@/apps/desktop/shared/ipc-contract.js";
import type { Config } from "@/config/schema.js";
import { resolveMainLocale } from "./i18n.js";
import type { DesktopIpcDependencies } from "./ipc.js";

/**
 * Ce qu'un réglage enregistré doit changer tout de suite dans l'application.
 *
 * Un raccourci choisi et jamais appliqué est un réglage qui ment. Les
 * combinaisons étaient lues une seule fois au démarrage : changer le choix ne
 * faisait rien, et l'écran continuait d'annoncer l'ancien comme actif. Même
 * règle pour les fenêtres gardées ouvertes ; la langue, elle, ne s'applique
 * proprement qu'au redémarrage.
 */
export function applySavedPreferences(
  dependencies: Pick<
    DesktopIpcDependencies,
    "onShortcutsChanged" | "onKeepOpenOnBlurChanged" | "relaunchApp"
  >,
  patch: ConfigWriteRequest,
  config: { before: Config; after: Config; env: NodeJS.ProcessEnv },
): void {
  if (patch.desktopShortcuts !== undefined) {
    dependencies.onShortcutsChanged?.(config.after.desktopShortcuts);
  }
  if (patch.desktopKeepOpenOnBlur !== undefined) {
    dependencies.onKeepOpenOnBlurChanged?.(patch.desktopKeepOpenOnBlur);
  }
  if (
    patch.uiLocale !== undefined &&
    resolveMainLocale(config.before.uiLocale, config.env) !==
      resolveMainLocale(config.after.uiLocale, config.env)
  ) {
    dependencies.relaunchApp?.();
  }
}
