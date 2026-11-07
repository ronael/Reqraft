// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { userEvent, type UserEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  WELCOME_TOUR_SLIDES,
  WelcomeTour,
} from "@/apps/desktop/renderer/onboarding/WelcomeTour.js";
import { TranslationProvider } from "@/apps/desktop/renderer/shared/i18n.js";
import type { DesktopPlatform, ReqraftBridge } from "@/apps/desktop/shared/ipc-contract.js";
import { createDesktopTranslator, DESKTOP_MESSAGES } from "@/i18n/desktop/index.js";

/**
 * La visite de bienvenue montée pour de vrai : on clique, on appuie sur les
 * flèches, et ce que l'on vérifie est l'écran affiché et le moment où la
 * visite rend la main à l'onboarding. Le contenu statique de la visite (six
 * cas d'usage, libellés traduits, touches de la capsule) est couvert par
 * `desktop-welcome-tour.test.ts`.
 */

const t = createDesktopTranslator("en");

type Ecran = (typeof WELCOME_TOUR_SLIDES)[number];

/**
 * Un détail propre à la démonstration de chaque écran.
 *
 * La scène est décorative (`aria-hidden`) : on la lit par son texte, pas par
 * ses rôles.
 */
const DEMONSTRATIONS: Record<Ecran["visual"], string> = {
  mail: t("onboarding.tour.mail.subjectValue"),
  chat: t("onboarding.tour.chat.placeholder"),
  code: "Header.tsx",
  profiles: t("onboarding.tour.profiles.detects"),
  providers: t("onboarding.tour.providers.ecosystemTitle"),
  privacy: t("onboarding.tour.privacy.keychain"),
};

interface Visite {
  readonly onContinue: Mock<() => void>;
  readonly user: UserEvent;
}

/** Monte la visite et attend le premier écran, libellés compris. */
async function monterVisite(platform: DesktopPlatform = "darwin"): Promise<Visite> {
  // La visite ne lit du pont que la plateforme, et ses libellés.
  window.reqraft = {
    platform,
    readLocale: () => Promise.resolve({ locale: "en", messages: DESKTOP_MESSAGES.en }),
  } as unknown as ReqraftBridge;
  const onContinue = vi.fn<() => void>();
  render(
    <TranslationProvider>
      <WelcomeTour onContinue={onContinue} />
    </TranslationProvider>,
  );
  await screen.findByRole("heading", { name: t(WELCOME_TOUR_SLIDES[0].title) });
  return { onContinue, user: userEvent.setup() };
}

function bouton(nom: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name: nom });
}

/** Le point de progression qui mène à l'écran donné, compté à partir de 1. */
function point(numero: number): HTMLButtonElement {
  return bouton(t("onboarding.tour.goTo", { step: String(numero) }));
}

/** Ce que la personne lit : le compteur, le titre, le texte et la démonstration. */
function verifierEcran(numero: number, ecran: Ecran): void {
  const compteur = t("onboarding.tour.step", {
    current: String(numero),
    total: String(WELCOME_TOUR_SLIDES.length),
  });
  expect(screen.getByText(compteur)).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(t(ecran.title));
  expect(screen.getByText(t(ecran.body))).toBeTruthy();
  expect(screen.getByText(DEMONSTRATIONS[ecran.visual])).toBeTruthy();
  expect(point(numero).getAttribute("aria-current")).toBe("step");
}

function ecranAffiche(): string {
  return screen.getByRole("heading", { level: 1 }).textContent;
}

afterEach(() => {
  cleanup();
});

describe("la visite de bienvenue, à la souris", () => {
  it("s'ouvre sur le premier écran, sans retour possible", async () => {
    await monterVisite();

    verifierEcran(1, WELCOME_TOUR_SLIDES[0]);
    expect(bouton(t("onboarding.tour.back")).disabled).toBe(true);
    const progression = screen.getByLabelText(t("onboarding.tour.progress"));
    expect(within(progression).getAllByRole("button")).toHaveLength(WELCOME_TOUR_SLIDES.length);
    expect(point(2).getAttribute("aria-current")).toBeNull();
  });

  it("avance d'un écran à chaque « Continuer », chacun avec sa démonstration", async () => {
    const { onContinue, user } = await monterVisite();

    for (const [index, ecran] of WELCOME_TOUR_SLIDES.entries()) {
      verifierEcran(index + 1, ecran);
      if (index < WELCOME_TOUR_SLIDES.length - 1) {
        await user.click(bouton(t("onboarding.tour.next")));
      }
    }

    expect(onContinue).not.toHaveBeenCalled();
  });

  it("finit sur « Configurer Reqraft », qui rend la main à l'onboarding", async () => {
    const { onContinue, user } = await monterVisite();

    await user.click(point(WELCOME_TOUR_SLIDES.length));

    expect(screen.queryByRole("button", { name: t("onboarding.tour.next") })).toBeNull();
    await user.click(bouton(t("onboarding.tour.configure")));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("revient à l'écran précédent", async () => {
    const { user } = await monterVisite();
    await user.click(bouton(t("onboarding.tour.next")));
    await user.click(bouton(t("onboarding.tour.next")));

    await user.click(bouton(t("onboarding.tour.back")));

    verifierEcran(2, WELCOME_TOUR_SLIDES[1]);
    expect(bouton(t("onboarding.tour.back")).disabled).toBe(false);
  });

  it("saute directement à l'écran choisi dans la progression", async () => {
    const { user } = await monterVisite();

    await user.click(point(5));
    verifierEcran(5, WELCOME_TOUR_SLIDES[4]);
    expect(point(1).getAttribute("aria-current")).toBeNull();

    await user.click(point(2));
    verifierEcran(2, WELCOME_TOUR_SLIDES[1]);
  });

  it("se passe depuis n'importe quel écran", async () => {
    const { onContinue, user } = await monterVisite();
    await user.click(bouton(t("onboarding.tour.next")));

    await user.click(bouton(t("onboarding.tour.skip")));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("rejoue la démonstration sans changer d'écran", async () => {
    const { user } = await monterVisite();
    await user.click(bouton(t("onboarding.tour.next")));
    const avant = screen.getByText(DEMONSTRATIONS.chat);

    await user.click(bouton(t("onboarding.tour.replay")));

    // jsdom n'anime rien : ce qui relance l'animation CSS, c'est une scène
    // recréée, et l'ancienne qui quitte le document.
    expect(screen.getByText(DEMONSTRATIONS.chat)).not.toBe(avant);
    expect(avant.isConnected).toBe(false);
    verifierEcran(2, WELCOME_TOUR_SLIDES[1]);
  });
});

describe("la visite de bienvenue, au clavier", () => {
  it("se parcourt avec les flèches, sans reculer avant le premier écran", async () => {
    const { onContinue, user } = await monterVisite();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    verifierEcran(3, WELCOME_TOUR_SLIDES[2]);

    await user.keyboard("{ArrowLeft}");
    verifierEcran(2, WELCOME_TOUR_SLIDES[1]);

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    verifierEcran(1, WELCOME_TOUR_SLIDES[0]);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("rend la main à l'onboarding sur la flèche droite du dernier écran", async () => {
    const { onContinue, user } = await monterVisite();
    await user.click(point(WELCOME_TOUR_SLIDES.length));

    await user.keyboard("{ArrowRight}");

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("avance sur Entrée quand le focus n'est sur aucun bouton", async () => {
    const { user } = await monterVisite();

    await user.keyboard("{Enter}");

    verifierEcran(2, WELCOME_TOUR_SLIDES[1]);
  });

  it("laisse Entrée au bouton qui a le focus, sans avancer une seconde fois", async () => {
    const { onContinue, user } = await monterVisite();

    bouton(t("onboarding.tour.next")).focus();
    await user.keyboard("{Enter}");
    expect(ecranAffiche()).toBe(t(WELCOME_TOUR_SLIDES[1].title));

    bouton(t("onboarding.tour.skip")).focus();
    await user.keyboard("{Enter}");
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(ecranAffiche()).toBe(t(WELCOME_TOUR_SLIDES[1].title));
  });
});

describe("les raccourcis montrés par la visite", () => {
  const MAC = {
    global: `${t("shortcut.cmd")} + ${t("shortcut.option")} + R`,
    comparer: "⌘D",
  };
  const PC = {
    global: `${t("shortcut.ctrl")} + ${t("shortcut.alt")} + R`,
    comparer: "Ctrl+D",
  };

  it.each([
    ["darwin", MAC, PC],
    ["win32", PC, MAC],
    ["linux", PC, MAC],
  ] as const)("suivent la plateforme annoncée par le pont : %s", async (platform, voulu, autre) => {
    await monterVisite(platform);

    expect(screen.getByText(voulu.global)).toBeTruthy();
    expect(screen.getByText(voulu.comparer)).toBeTruthy();
    expect(screen.queryByText(autre.global)).toBeNull();
    expect(screen.queryByText(autre.comparer)).toBeNull();
  });
});
