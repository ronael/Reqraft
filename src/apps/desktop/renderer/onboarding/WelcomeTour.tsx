import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Command,
  KeyRound,
  ScanText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useT, type Translate } from "../shared/i18n.js";
import type { SetupBlocker } from "@/apps/desktop/shared/ipc-contract.js";

export const WELCOME_TOUR_SLIDES = [
  {
    title: "onboarding.tour.capture.title",
    body: "onboarding.tour.capture.body",
    visual: "capture",
    icon: ScanText,
  },
  {
    title: "onboarding.tour.control.title",
    body: "onboarding.tour.control.body",
    visual: "control",
    icon: SlidersHorizontal,
  },
  {
    title: "onboarding.tour.privacy.title",
    body: "onboarding.tour.privacy.body",
    visual: "privacy",
    icon: ShieldCheck,
  },
] as const;

interface WelcomeTourProps {
  onContinue(): void;
}

export function shouldShowWelcomeTour(
  blocker: SetupBlocker | undefined,
  dismissed: boolean,
): boolean {
  return blocker === "config_missing" && !dismissed;
}

export function WelcomeTour({ onContinue }: Readonly<WelcomeTourProps>): React.JSX.Element {
  const t = useT();
  const [index, setIndex] = useState(0);
  const slide = WELCOME_TOUR_SLIDES[index] ?? WELCOME_TOUR_SLIDES[0];
  const isLast = index === WELCOME_TOUR_SLIDES.length - 1;

  const advance = useCallback(() => {
    if (isLast) {
      onContinue();
      return;
    }
    setIndex((current) => Math.min(current + 1, WELCOME_TOUR_SLIDES.length - 1));
  }, [isLast, onContinue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(0, current - 1));
      if (event.key === "ArrowRight") advance();
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) advance();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [advance]);

  const SlideIcon = slide.icon;
  return (
    <main className="onboarding onboarding-tour-shell">
      <div className="settings-titlebar">
        <div className="settings-titlebar-spacer" aria-hidden />
        <div className="settings-title">Reqraft</div>
        <span className="onboarding-badge">{t("onboarding.tour.badge")}</span>
      </div>

      <section className="onboarding-tour" aria-live="polite">
        <header className="onboarding-tour-header">
          <span className="onboarding-tour-icon" aria-hidden>
            <SlideIcon size={21} />
          </span>
          <p className="onboarding-tour-step">
            {t("onboarding.tour.step", {
              current: String(index + 1),
              total: String(WELCOME_TOUR_SLIDES.length),
            })}
          </p>
          <h1>{t(slide.title)}</h1>
          <p>{t(slide.body)}</p>
        </header>

        <TourVisual visual={slide.visual} t={t} />
      </section>

      <footer className="onboarding-footer onboarding-tour-footer">
        <div className="onboarding-tour-actions">
          <button type="button" className="button-secondary" onClick={onContinue}>
            {t("onboarding.tour.skip")}
          </button>

          <div className="onboarding-tour-dots" aria-label={t("onboarding.tour.progress")}>
            {WELCOME_TOUR_SLIDES.map((entry, slideIndex) => (
              <button
                key={entry.title}
                type="button"
                className={
                  slideIndex === index ? "onboarding-tour-dot active" : "onboarding-tour-dot"
                }
                aria-label={t("onboarding.tour.goTo", { step: String(slideIndex + 1) })}
                aria-current={slideIndex === index ? "step" : undefined}
                onClick={() => {
                  setIndex(slideIndex);
                }}
              />
            ))}
          </div>

          <div className="onboarding-tour-navigation">
            <button
              type="button"
              className="button-secondary"
              disabled={index === 0}
              onClick={() => {
                setIndex((current) => Math.max(0, current - 1));
              }}
            >
              <ArrowLeft size={14} aria-hidden />
              {t("onboarding.tour.back")}
            </button>
            <button type="button" className="button-primary" onClick={advance}>
              {t(isLast ? "onboarding.tour.configure" : "onboarding.tour.next")}
              <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}

function TourVisual({
  visual,
  t,
}: Readonly<{
  visual: (typeof WELCOME_TOUR_SLIDES)[number]["visual"];
  t: Translate;
}>): React.JSX.Element {
  switch (visual) {
    case "capture":
      return <CaptureVisual t={t} />;
    case "control":
      return <ControlVisual t={t} />;
    case "privacy":
      return <PrivacyVisual t={t} />;
  }
}

function CaptureVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <div className="onboarding-tour-visual onboarding-tour-capture" aria-hidden>
      <div className="tour-capsule-bar">
        <span className="tour-brand-mark" />
        <span>Reqraft</span>
        <span className="tour-profile">clean</span>
      </div>
      <div className="tour-selection">
        <span className="tour-visual-label">
          <ScanText size={13} /> {t("onboarding.tour.capture.selection")}
        </span>
        <p>{t("onboarding.tour.capture.original")}</p>
      </div>
      <div className="tour-result">
        <span className="tour-visual-label">
          <Sparkles size={13} /> {t("onboarding.tour.capture.result")}
        </span>
        <p>{t("onboarding.tour.capture.rewritten")}</p>
      </div>
      <div className="tour-capsule-footer">
        <span>
          <kbd>⌘⌃R</kbd> {t("onboarding.tour.capture.shortcut")}
        </span>
        <span className="tour-ready">
          <CheckCircle2 size={12} /> {t("capsule.qualityGood")}
        </span>
      </div>
    </div>
  );
}

function ControlVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <div className="onboarding-tour-visual onboarding-tour-control" aria-hidden>
      <div className="tour-control-row">
        <span>{t("onboarding.tour.control.profile")}</span>
        <div className="tour-segmented">
          <span className="active">clean</span>
          <span>code</span>
          <span>writing</span>
        </div>
      </div>
      <div className="tour-control-row">
        <span>{t("onboarding.tour.control.level")}</span>
        <div className="tour-levels">
          <span>{t("onboarding.levelMinimal")}</span>
          <span className="active">{t("onboarding.levelStandard")}</span>
          <span>{t("onboarding.levelComplete")}</span>
        </div>
      </div>
      <div className="tour-quality-row">
        <ShieldCheck size={18} />
        <span>
          <strong>{t("onboarding.tour.control.fidelity")}</strong>
          <small>{t("onboarding.tour.control.fidelityDetail")}</small>
        </span>
        <CheckCircle2 size={16} className="tour-quality-check" />
      </div>
    </div>
  );
}

function PrivacyVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  const items = [
    {
      icon: ShieldCheck,
      title: "onboarding.tour.privacy.ephemeral",
      detail: "onboarding.tour.privacy.ephemeralDetail",
    },
    {
      icon: KeyRound,
      title: "onboarding.tour.privacy.keychain",
      detail: "onboarding.tour.privacy.keychainDetail",
    },
    {
      icon: Command,
      title: "onboarding.tour.privacy.available",
      detail: "onboarding.tour.privacy.availableDetail",
    },
  ] as const;
  return (
    <div className="onboarding-tour-visual onboarding-tour-privacy" aria-hidden>
      {items.map((item) => {
        const ItemIcon = item.icon;
        return (
          <div key={item.title} className="tour-privacy-row">
            <span className="tour-privacy-icon">
              <ItemIcon size={18} />
            </span>
            <span>
              <strong>{t(item.title)}</strong>
              <small>{t(item.detail)}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
