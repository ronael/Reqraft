import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  Command,
  FileText,
  KeyRound,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquareText,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { useT, type Translate } from "../shared/i18n.js";
import type { SetupBlocker } from "@/apps/desktop/shared/ipc-contract.js";

export const WELCOME_TOUR_SLIDES = [
  {
    title: "onboarding.tour.mail.title",
    body: "onboarding.tour.mail.body",
    visual: "mail",
    icon: Mail,
  },
  {
    title: "onboarding.tour.chat.title",
    body: "onboarding.tour.chat.body",
    visual: "chat",
    icon: MessageSquareText,
  },
  {
    title: "onboarding.tour.code.title",
    body: "onboarding.tour.code.body",
    visual: "code",
    icon: Code2,
  },
  {
    title: "onboarding.tour.profiles.title",
    body: "onboarding.tour.profiles.body",
    visual: "profiles",
    icon: UserPlus,
  },
  {
    title: "onboarding.tour.providers.title",
    body: "onboarding.tour.providers.body",
    visual: "providers",
    icon: KeyRound,
  },
  {
    title: "onboarding.tour.privacy.title",
    body: "onboarding.tour.privacy.body",
    visual: "privacy",
    icon: ShieldCheck,
  },
] as const;

export const WELCOME_TOUR_PROFILE_IDS = ["auto", "clean", "code", "writing"] as const;
export const WELCOME_TOUR_PROVIDERS = [
  { id: "anthropic", initials: "A", name: "Anthropic" },
  { id: "openai", initials: "O", name: "OpenAI" },
  { id: "mistral", initials: "M", name: "Mistral" },
] as const;

type TourDirection = "forward" | "backward";

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
          key={slide.visual}
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
            animationRun={animationRun}
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
  animationRun,
  t,
  onReplay,
}: Readonly<{
  visual: (typeof WELCOME_TOUR_SLIDES)[number]["visual"];
  animationRun: number;
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
      <div
        key={`${visual}-${String(animationRun)}`}
        className="onboarding-tour-scene-content"
        aria-hidden
      >
        {visual === "mail" ? <MailVisual t={t} /> : null}
        {visual === "chat" ? <ChatVisual t={t} /> : null}
        {visual === "code" ? <CodeVisual t={t} /> : null}
        {visual === "profiles" ? <ProfilesVisual t={t} /> : null}
        {visual === "providers" ? <ProvidersVisual t={t} /> : null}
        {visual === "privacy" ? <PrivacyVisual t={t} /> : null}
      </div>
    </div>
  );
}

function WindowControls(): React.JSX.Element {
  return (
    <span className="tour-window-controls">
      <i />
      <i />
      <i />
    </span>
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

function ResultCapsule({
  t,
  profile,
  sourceKey,
  resultKey,
  className = "",
}: Readonly<{
  t: Translate;
  profile: string;
  sourceKey: Parameters<Translate>[0];
  resultKey: Parameters<Translate>[0];
  className?: string;
}>): React.JSX.Element {
  return (
    <div className={`tour-demo-capsule ${className}`}>
      <CapsuleHeader>
        <span className="tour-demo-profile tour-demo-profile-active">{profile}</span>
      </CapsuleHeader>
      <div className="tour-demo-source">
        <span>{t("onboarding.tour.capture.selection")}</span>
        <p>{t(sourceKey)}</p>
      </div>
      <div className="tour-demo-result">
        <span>{t("onboarding.tour.capture.result")}</span>
        <p>{t(resultKey)}</p>
      </div>
      <div className="tour-demo-verdict">
        <CheckCircle2 size={14} />
        <span>{t("onboarding.tour.control.fidelity")}</span>
        <i />
      </div>
    </div>
  );
}

function MailVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <div className="tour-app-window tour-mail-window">
        <div className="tour-app-titlebar">
          <WindowControls />
          <Mail size={12} />
          <span>{t("onboarding.tour.mail.compose")}</span>
          <em>{t("onboarding.tour.mail.draft")}</em>
        </div>
        <div className="tour-mail-fields">
          <span>{t("onboarding.tour.mail.to")}</span>
          <b>team@studio.example</b>
          <span>{t("onboarding.tour.mail.subject")}</span>
          <b>{t("onboarding.tour.mail.subjectValue")}</b>
        </div>
        <div className="tour-mail-copy">
          <p>{t("onboarding.tour.mail.hello")}</p>
          <p>
            <span className="tour-inline-selection">{t("onboarding.tour.mail.original")}</span>
          </p>
          <p>{t("onboarding.tour.mail.signoff")}</p>
        </div>
      </div>
      <TourShortcut t={t} />
      <ResultCapsule
        t={t}
        profile="writing"
        sourceKey="onboarding.tour.mail.original"
        resultKey="onboarding.tour.mail.rewritten"
        className="tour-demo-capsule-mail"
      />
    </>
  );
}

function ChatVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <div className="tour-app-window tour-chat-window">
        <div className="tour-app-titlebar">
          <WindowControls />
          <MessageSquareText size={12} />
          <span>ChatGPT</span>
          <em>{t("onboarding.tour.chat.newChat")}</em>
        </div>
        <div className="tour-chat-body">
          <span className="tour-chat-avatar">AI</span>
          <p>{t("onboarding.tour.chat.assistant")}</p>
          <p className="tour-chat-user">{t("onboarding.tour.chat.original")}</p>
        </div>
      </div>
      <ResultCapsule
        t={t}
        profile="auto"
        sourceKey="onboarding.tour.chat.original"
        resultKey="onboarding.tour.chat.rewritten"
        className="tour-demo-capsule-chat"
      />
    </>
  );
}

function CodeVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <div className="tour-app-window tour-code-window">
        <div className="tour-app-titlebar">
          <WindowControls />
          <Code2 size={12} />
          <span>Header.tsx</span>
          <em>TypeScript React</em>
        </div>
        <div className="tour-code-body">
          <span>12</span>
          <code>export function Header() &#123;</code>
          <span>13</span>
          <code>&nbsp;&nbsp;return (</code>
          <span className="active">14</span>
          <code className="tour-code-selection">{t("onboarding.tour.code.original")}</code>
          <span>15</span>
          <code>&nbsp;&nbsp;&nbsp;&nbsp;&lt;Navigation /&gt;</code>
          <span>16</span>
          <code>&nbsp;&nbsp;)</code>
        </div>
      </div>
      <ResultCapsule
        t={t}
        profile="code"
        sourceKey="onboarding.tour.code.original"
        resultKey="onboarding.tour.code.rewritten"
        className="tour-demo-capsule-code"
      />
    </>
  );
}

function SettingsFrame({
  t,
  activeTab,
  children,
}: Readonly<{
  t: Translate;
  activeTab: "profiles" | "providers";
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="tour-settings-window">
      <div className="tour-app-titlebar">
        <WindowControls />
        <span>{t("onboarding.tour.settings.title")}</span>
      </div>
      <div className="tour-settings-tabs">
        <span>{t("onboarding.tour.settings.shortcuts")}</span>
        <span className={activeTab === "providers" ? "active" : undefined}>
          {t("onboarding.tour.settings.providers")}
        </span>
        <span>{t("onboarding.tour.settings.models")}</span>
        <span className={activeTab === "profiles" ? "active" : undefined}>
          {t("onboarding.tour.settings.profiles")}
        </span>
      </div>
      {children}
    </div>
  );
}

function ProfilesVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <SettingsFrame t={t} activeTab="profiles">
      <div className="tour-settings-content tour-profile-content">
        <div className="tour-settings-section-title">
          <span>{t("onboarding.tour.profiles.available")}</span>
        </div>
        <div className="tour-profile-search">
          <Search size={12} />
          <span>{t("onboarding.tour.profiles.search")}</span>
        </div>
        <ProfileRow name="auto" detail={t("onboarding.tour.profiles.detects")} active />
        <ProfileRow name="clean" detail={t("onboarding.tour.profiles.clarify")} />
        <ProfileRow name="code" detail={t("onboarding.tour.profiles.agents")} />
        <div className="tour-profile-add">
          <Plus size={13} />
          <span>{t("onboarding.tour.profiles.add")}</span>
        </div>
      </div>
    </SettingsFrame>
  );
}

function ProfileRow({
  name,
  detail,
  active = false,
}: Readonly<{ name: string; detail: string; active?: boolean }>): React.JSX.Element {
  return (
    <div className={active ? "tour-profile-row active" : "tour-profile-row"}>
      <i />
      <code>{name}</code>
      <span>{detail}</span>
      {active ? <Check size={13} /> : null}
    </div>
  );
}

function ProvidersVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <SettingsFrame t={t} activeTab="providers">
      <div className="tour-settings-content tour-provider-content">
        <div className="tour-settings-section-title">
          <span>{t("onboarding.tour.providers.builtIn")}</span>
        </div>
        {WELCOME_TOUR_PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider.id}
            initials={provider.initials}
            name={provider.name}
            status={t("onboarding.tour.providers.addKey")}
          />
        ))}
        <div className="tour-provider-add">
          <Plus size={13} />
          <span>{t("onboarding.tour.providers.compatible")}</span>
        </div>
        <div className="tour-keychain-note">
          <LockKeyhole size={12} />
          <span>{t("onboarding.tour.providers.keychain")}</span>
        </div>
      </div>
    </SettingsFrame>
  );
}

function ProviderRow({
  initials,
  name,
  status,
}: Readonly<{ initials: string; name: string; status: string }>): React.JSX.Element {
  return (
    <div className="tour-provider-row">
      <b>{initials}</b>
      <span>{name}</span>
      <em>{status}</em>
    </div>
  );
}

function PrivacyVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <>
      <div className="tour-app-window tour-privacy-backdrop">
        <div className="tour-app-titlebar">
          <WindowControls />
          <FileText size={12} />
          <span>specification.md</span>
          <em>{t("onboarding.tour.capture.editing")}</em>
        </div>
        <div className="tour-privacy-document">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="tour-demo-capsule tour-demo-capsule-privacy">
        <CapsuleHeader>
          <span className="tour-private-status">
            <LockKeyhole size={11} /> {t("onboarding.tour.privacy.private")}
          </span>
        </CapsuleHeader>
        <p className="tour-privacy-result">{t("onboarding.tour.privacy.example")}</p>
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
