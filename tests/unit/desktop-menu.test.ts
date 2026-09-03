import { describe, expect, it, vi } from "vitest";
import {
  desktopMenuTemplate,
  FORBIDDEN_MENU_ROLES,
  installDesktopMenu,
  type MenuTemplateItem,
} from "@/apps/desktop/main/menu.js";

/**
 * Le menu applicatif, et les raccourcis qu'il ne doit pas confisquer.
 *
 * Electron pose un menu par défaut quand l'application n'en pose aucun, et ce
 * menu détient `⌘R`. Sur macOS un raccourci de menu est traité avant que la
 * frappe n'atteigne la page : la capsule a beau couper `⌘R` pendant l'édition,
 * la fenêtre se rechargeait quand même et le texte corrigé disparaissait. Le
 * scénario `capsule-ui` vérifie le menu réellement installé ; ces cas-ci
 * tiennent le gabarit dont il sort.
 */

function roles(items: MenuTemplateItem[]): string[] {
  return items.flatMap((item) => [
    ...(item.role === undefined ? [] : [item.role]),
    ...(item.submenu === undefined ? [] : roles(item.submenu)),
  ]);
}

describe("le gabarit du menu desktop", () => {
  it("ne porte aucun rôle qui vole un raccourci de la capsule", () => {
    for (const devTools of [true, false]) {
      const installed = roles(desktopMenuTemplate({ devTools }));
      for (const interdit of FORBIDDEN_MENU_ROLES) {
        expect(installed, `devTools=${String(devTools)}`).not.toContain(interdit);
      }
    }
  });

  it("garde le menu Édition, dont dépendent ⌘C, ⌘V et ⌘A dans les champs", () => {
    // Sur macOS ces raccourcis passent par les rôles du menu : sans lui, la
    // saisie des réglages, de l'onboarding et de la capsule cesse de répondre.
    expect(roles(desktopMenuTemplate({ devTools: false }))).toContain("editMenu");
  });

  it("garde le menu de l'application, donc ⌘Q et les services", () => {
    expect(roles(desktopMenuTemplate({ devTools: false }))).toContain("appMenu");
  });

  it("n'expose les outils de développement qu'en développement", () => {
    expect(roles(desktopMenuTemplate({ devTools: true }))).toContain("toggleDevTools");
    expect(roles(desktopMenuTemplate({ devTools: false }))).not.toContain("toggleDevTools");
  });
});

describe("installDesktopMenu", () => {
  it("construit le gabarit et l'installe, dans cet ordre", () => {
    const built = { id: "menu" };
    const buildFromTemplate = vi.fn(() => built);
    const setApplicationMenu = vi.fn();

    installDesktopMenu({ buildFromTemplate, setApplicationMenu }, { devTools: false });

    expect(buildFromTemplate).toHaveBeenCalledWith(desktopMenuTemplate({ devTools: false }));
    expect(setApplicationMenu).toHaveBeenCalledWith(built);
  });
});
