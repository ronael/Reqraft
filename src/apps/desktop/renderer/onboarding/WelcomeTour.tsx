import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Cpu,
  FileText,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UserPlus,
  UserRound,
  Waypoints,
} from "lucide-react";
import { useT, type Translate } from "../shared/i18n.js";
import { formatAccelerator } from "../shared/shortcut-labels.js";
import type { SetupBlocker } from "@/apps/desktop/shared/ipc-contract.js";
import { version } from "@/version.js";

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
  { id: "deepseek", initials: "D", name: "DeepSeek" },
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
      <b className="tour-shortcut-brand">rq</b>
      <kbd>{formatAccelerator("Command+Control+R", t)}</kbd>
    </div>
  );
}

function ProductCapsule({
  t,
  profile,
  sourceKey,
  resultKey,
  sourceApp,
  className = "",
}: Readonly<{
  t: Translate;
  profile: string;
  sourceKey: Parameters<Translate>[0];
  resultKey: Parameters<Translate>[0];
  sourceApp?: string;
  className?: string;
}>): React.JSX.Element {
  return (
    <div className={`tour-product-capsule ${className}`}>
      <div className="tour-product-capsule-band">
        <b>rq</b>
        <span>
          {sourceApp === undefined
            ? t("capsule.newReformulation")
            : t("capsule.selectionFrom", { app: sourceApp })}
        </span>
        <em>
          {t("capsule.profile")} <strong>{profile}</strong>
        </em>
      </div>
      <div className="tour-product-capsule-body">
        <p className="tour-product-capsule-source">
          <span>{t("capsule.before")}</span> <i>{t(sourceKey)}</i>
        </p>
        <p className="tour-product-capsule-result">{t(resultKey)}</p>
      </div>
      <div className="tour-product-capsule-quality">
        <strong>{t("capsule.qualityGood")}</strong>
        <span>{t("capsule.noInvention")}</span>
        <em>{t("profiles.levelMeta", { level: "standard" })} · claude-sonnet-5 · 0.8 s</em>
      </div>
      <div className="tour-product-capsule-actions">
        <b>{profile}</b>
        <span className="capsule-key key-primary">
          <kbd>↵</kbd>
          {t("capsule.replace")}
        </span>
        <span className="capsule-key">
          <kbd>⌥</kbd>
          {t("capsule.compare")}
        </span>
        <span className="capsule-key">
          <kbd>⌘C</kbd>
          {t("capsule.copy")}
        </span>
        <span className="capsule-key key-close">
          <kbd>esc</kbd>
          {t("capsule.close")}
        </span>
      </div>
    </div>
  );
}

function ProductPopover({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <div className="tour-product-popover">
      <p>{t("onboarding.tour.chat.rewritten")}</p>
      <div className="tour-product-popover-controls">
        <b>auto</b>
        <span>standard</span>
      </div>
      <div className="tour-product-popover-footer">
        <strong className="capsule-key key-primary">
          <kbd>⌘↵</kbd>
          {t("capsule.reformulate")}
        </strong>
        <span>{t("popover.settings")}</span>
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
      <ProductCapsule
        t={t}
        profile="writing"
        sourceKey="onboarding.tour.mail.original"
        resultKey="onboarding.tour.mail.rewritten"
        sourceApp="Mail"
        className="tour-product-capsule-mail"
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
      <ProductPopover t={t} />
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
      <ProductCapsule
        t={t}
        profile="code"
        sourceKey="onboarding.tour.code.original"
        resultKey="onboarding.tour.code.rewritten"
        sourceApp="Code"
        className="tour-product-capsule-code"
      />
    </>
  );
}

function ProductSettingsFrame({
  t,
  activeTab,
  children,
}: Readonly<{
  t: Translate;
  activeTab: "profiles" | "providers";
  children: React.ReactNode;
}>): React.JSX.Element {
  const nav = [
    ["profiles", UserRound, "settings.nav.profiles"],
    ["providers", Waypoints, "settings.nav.providers"],
    ["models", Cpu, "settings.nav.models"],
    ["preferences", SlidersHorizontal, "settings.nav.preferences"],
    ["diagnostic", Stethoscope, "settings.nav.diagnostic"],
  ] as const;

  return (
    <div className="tour-product-settings">
      <div className="tour-product-settings-titlebar">
        <WindowControls />
        <strong>Reqraft</strong>
        <em>{t("settings.ready")}</em>
      </div>
      <div className="tour-product-settings-shell">
        <aside className="tour-product-settings-sidebar">
          <div className="tour-product-settings-brand">
            <strong>reqraft</strong>
            <small>{version}</small>
            <p>{t("settings.tagline")}</p>
          </div>
          <nav>
            {nav.map(([id, Icon, key]) => (
              <span key={id} className={activeTab === id ? "active" : undefined}>
                <Icon size={10} /> {t(key)}
              </span>
            ))}
          </nav>
          <div className="tour-product-settings-context">
            <b>{t("settings.context")}</b>
            <span>
              <i>{t("settings.context.provider")}</i>
              <em>anthropic</em>
            </span>
            <span>
              <i>{t("settings.context.profile")}</i>
              <em>auto</em>
            </span>
            <span>
              <i>{t("settings.context.level")}</i>
              <em>standard</em>
            </span>
          </div>
        </aside>
        <section className="tour-product-settings-main">
          <header>
            <h2>
              {t(activeTab === "profiles" ? "settings.nav.profiles" : "settings.nav.providers")}
            </h2>
            <p>
              {t(
                activeTab === "profiles" ? "settings.profiles.detail" : "settings.providers.detail",
              )}
            </p>
          </header>
          <div className="tour-product-settings-content">{children}</div>
          <footer>
            <span>{t("settings.footer")}</span>
            <kbd>⌘,</kbd>
          </footer>
        </section>
      </div>
    </div>
  );
}

function ProfilesVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  const builtinLabel = t("profiles.builtin");
  return (
    <ProductSettingsFrame t={t} activeTab="profiles">
      <div className="tour-product-profile-toolbar">
        <p>{t("profiles.intro")}</p>
        <span>
          <Plus size={13} />
          {t("profiles.new")}
        </span>
      </div>
      <div className="tour-product-profile-grid">
        <ProductProfileCard
          name="Auto"
          id="auto"
          detail={t("onboarding.tour.profiles.detects")}
          origin={builtinLabel}
          active
        />
        <ProductProfileCard
          name="Writing"
          id="writing"
          detail={t("onboarding.tour.profiles.clarify")}
          origin={builtinLabel}
        />
        <ProductProfileCard
          name="Code"
          id="code"
          detail={t("onboarding.tour.profiles.agents")}
          origin={builtinLabel}
        />
        <ProductProfileCard
          name="Clean"
          id="clean"
          detail={t("onboarding.tour.profiles.clarify")}
          origin={builtinLabel}
        />
      </div>
    </ProductSettingsFrame>
  );
}

function ProductProfileCard({
  name,
  id,
  detail,
  origin,
  active = false,
}: Readonly<{
  name: string;
  id: string;
  detail: string;
  origin: string;
  active?: boolean;
}>): React.JSX.Element {
  return (
    <div className={active ? "tour-product-profile-card active" : "tour-product-profile-card"}>
      <p>
        <strong>{name}</strong>
        <span>{origin}</span>
      </p>
      <small>{detail}</small>
      <em>standard · {id}</em>
    </div>
  );
}

function ProvidersVisual({ t }: Readonly<{ t: Translate }>): React.JSX.Element {
  return (
    <ProductSettingsFrame t={t} activeTab="providers">
      <h3 className="tour-product-settings-subhead">{t("settings.builtinProviders")}</h3>
      <div className="tour-product-provider-list">
        {WELCOME_TOUR_PROVIDERS.map((provider) => (
          <ProductProviderRow
            key={provider.id}
            initials={provider.initials}
            name={provider.name}
            status={t("settings.addKey")}
          />
        ))}
      </div>
      <div className="tour-product-compatible-row">
        <span>
          <b>{t("settings.compatibleProviders")}</b>
          <small>{t("settings.noCustomProvider")}</small>
        </span>
        <em>
          <Plus size={10} /> {t("settings.addProvider")}
        </em>
      </div>
      <p className="tour-product-key-note">
        <LockKeyhole size={10} /> {t("settings.keysNote")}
      </p>
    </ProductSettingsFrame>
  );
}

function ProductProviderRow({
  initials,
  name,
  status,
}: Readonly<{ initials: string; name: string; status: string }>): React.JSX.Element {
  return (
    <div className="tour-product-provider-row">
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
      <div className="tour-product-privacy-note">
        <ShieldCheck size={12} />
        <span>{t("settings.footer")}</span>
        <em>
          <LockKeyhole size={10} /> {t("onboarding.tour.privacy.keychain")}
        </em>
      </div>
      <ProductCapsule
        t={t}
        profile="auto"
        sourceKey="onboarding.tour.privacy.example"
        resultKey="onboarding.tour.privacy.example"
        sourceApp="TextEdit"
        className="tour-product-capsule-privacy"
      />
    </>
  );
}
