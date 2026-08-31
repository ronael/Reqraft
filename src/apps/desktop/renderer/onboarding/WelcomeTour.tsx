import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Command,
  FileText,
  KeyRound,
  LockKeyhole,
  Menu,
  RotateCcw,
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

type TourDirection = "forward" | "backward";
const REWRITTEN_COPY_KEY = "onboarding.tour.capture.rewritten";

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
  const [direction, setDirection] = useState<TourDirection>("forward");
  const [animationRun, setAnimationRun] = useState(0);
  const slide = WELCOME_TOUR_SLIDES[index] ?? WELCOME_TOUR_SLIDES[0];
  const isLast = index === WELCOME_TOUR_SLIDES.length - 1;

  const goTo = useCallback(
    (nextIndex: number) => {
      const bounded = Math.max(0, Math.min(nextIndex, WELCOME_TOUR_SLIDES.length - 1));
      setDirection(bounded < index ? "backward" : "forward");
      setIndex(bounded);
      setAnimationRun((run) => run + 1);
    },
    [index],
  );

  const advance = useCallback(() => {
    if (isLast) {
      onContinue();
      return;
    }
    goTo(index + 1);
  }, [goTo, index, isLast, onContinue]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "ArrowLeft") goTo(index - 1);
      if (event.key === "ArrowRight") advance();
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) advance();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [advance, goTo, index]);

  const SlideIcon = slide.icon;
  return (
    <main className="onboarding onboarding-tour-shell">
      <div className="settings-titlebar">
        <div className="settings-titlebar-spacer" aria-hidden />
        <div className="settings-title">Reqraft</div>
        <span className="onboarding-badge">{t("onboarding.tour.badge")}</span>
      </div>

      <section className="onboarding-tour" aria-live="polite" aria-atomic="true">
        <div
          key={`${slide.visual}-${String(animationRun)}`}
          className={`onboarding-tour-content onboarding-tour-content-${direction}`}
        >
          <header className="onboarding-tour-header">
            <span className="onboarding-tour-icon" aria-hidden>
              <SlideIcon size={19} />
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

          <TourVisual
            visual={slide.visual}
            t={t}
            onReplay={() => {
              setAnimationRun((run) => run + 1);
            }}
          />
        </div>
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
                  goTo(slideIndex);
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
                goTo(index - 1);
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
  onReplay,
}: Readonly<{
  visual: (typeof WELCOME_TOUR_SLIDES)[number]["visual"];
  t: Translate;
  onReplay(): void;
}>): React.JSX.Element {
  return (
    <div className={`onboarding-tour-scene onboarding-tour-${visual}`}>
      <button
        type="button"
        className="icon-button onboarding-tour-replay"
        aria-label={t("onboarding.tour.replay")}
        title={t("onboarding.tour.replay")}
        onClick={onReplay}
      >
        <RotateCcw size={14} aria-hidden />
      </button>
      <div className="onboarding-tour-scene-content" aria-hidden>
        {visual === "capture" ? <CaptureVisual t={t} /> : null}
        {visual === "control" ? <ControlVisual t={t} /> : null}
        {visual === "privacy" ? <PrivacyVisual t={t} /> : null}
      </div>
    </div>
  );
}

function HostEditor({
  t,
  mode = "writing",
}: Readonly<{
  t: Translate;
  mode?: "writing" | "code";
}>): React.JSX.Element {
  return (
    <div className={`tour-host-editor tour-host-editor-${mode}`}>
      <div className="tour-host-bar">
        <FileText size={12} />
        <span>{mode === "code" ? "specification.md" : t("onboarding.tour.capture.document")}</span>
        <span className="tour-host-state">{t("onboarding.tour.capture.editing")}</span>
      </div>
      <div className="tour-editor-body">
        <span className="tour-editor-line-number">30</span>
        <span className="tour-editor-line tour-editor-line-muted">
          {t("onboarding.tour.capture.contextBefore")}
        </span>
        <span className="tour-editor-line-number tour-editor-selected-number">31</span>
        <span className="tour-editor-line tour-editor-selected">
          {t("onboarding.tour.capture.original")}
        </span>
        <span className="tour-editor-line-number">32</span>
        <span className="tour-editor-line tour-editor-line-muted">
          {t("onboarding.tour.capture.contextAfter")}
        </span>
      </div>
    </div>
  );
}

function TourShortcut({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <div className="tour-shortcut">
      <span className="tour-shortcut-brand">
        <Sparkles size={12} />
      </span>
      <kbd>⌘</kbd>
      <kbd>⌃</kbd>
      <kbd>R</kbd>
      <span>{t("onboarding.tour.capture.shortcut")}</span>
    </div>
  );
}

function CapsuleHeader({ children }: Readonly<{ children?: React.ReactNode }>): React.JSX.Element {
  return (
    <div className="tour-demo-capsule-header">
      <span className="tour-demo-brand">
        <Sparkles size={12} />
      </span>
      <strong>Reqraft</strong>
      {children}
    </div>
  );
}

function CaptureVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <HostEditor t={t} mode="code" />
      <TourShortcut t={t} />
      <div className="tour-demo-capsule tour-demo-capsule-capture">
        <CapsuleHeader>
          <span className="tour-demo-profile">clean</span>
        </CapsuleHeader>
        <div className="tour-demo-source">
          <span>{t("onboarding.tour.capture.selection")}</span>
          <p>{t("onboarding.tour.capture.original")}</p>
        </div>
        <div className="tour-demo-result">
          <span>{t("onboarding.tour.capture.result")}</span>
          <p>{t(REWRITTEN_COPY_KEY)}</p>
        </div>
        <div className="tour-demo-verdict">
          <CheckCircle2 size={14} />
          <span>{t("onboarding.tour.control.fidelity")}</span>
          <i />
        </div>
      </div>
    </>
  );
}

function ControlVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <HostEditor t={t} />
      <div className="tour-demo-capsule tour-demo-capsule-control">
        <CapsuleHeader>
          <span className="tour-demo-profile tour-demo-profile-active">clean</span>
        </CapsuleHeader>
        <p className="tour-control-result">{t(REWRITTEN_COPY_KEY)}</p>
        <div className="tour-control-choice">
          <span>{t("onboarding.tour.control.profile")}</span>
          <div className="tour-control-options">
            <b className="active">clean</b>
            <b>code</b>
            <b>writing</b>
          </div>
        </div>
        <div className="tour-control-choice tour-control-choice-level">
          <span>{t("onboarding.tour.control.level")}</span>
          <div className="tour-control-options">
            <b>{t("onboarding.tour.control.levelMinimal")}</b>
            <b className="active">{t("onboarding.tour.control.levelStandard")}</b>
            <b>{t("onboarding.tour.control.levelComplete")}</b>
          </div>
        </div>
        <div className="tour-demo-verdict">
          <ShieldCheck size={14} />
          <span>{t("onboarding.tour.control.fidelityDetail")}</span>
          <CheckCircle2 size={14} />
        </div>
      </div>
    </>
  );
}

function PrivacyVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <HostEditor t={t} mode="code" />
      <div className="tour-demo-capsule tour-demo-capsule-privacy">
        <CapsuleHeader>
          <span className="tour-private-status">
            <LockKeyhole size={11} /> {t("onboarding.tour.privacy.private")}
          </span>
        </CapsuleHeader>
        <p className="tour-privacy-result">{t(REWRITTEN_COPY_KEY)}</p>
        <div className="tour-privacy-signals">
          <span>
            <ShieldCheck size={15} />
            <b>{t("onboarding.tour.privacy.ephemeral")}</b>
          </span>
          <span>
            <KeyRound size={15} />
            <b>{t("onboarding.tour.privacy.keychain")}</b>
          </span>
          <span>
            <Menu size={15} />
            <b>{t("onboarding.tour.privacy.available")}</b>
          </span>
        </div>
        <div className="tour-private-footer">
          <Command size={13} />
          <span>{t("onboarding.tour.privacy.telemetry")}</span>
          <CheckCircle2 size={13} />
        </div>
      </div>
    </>
  );
}
