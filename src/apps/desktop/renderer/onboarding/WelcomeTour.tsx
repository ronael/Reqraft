import { type CSSProperties, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Code2,
  Cpu,
  FileText,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquareText,
  Plus,
  RotateCcw,
  SendHorizontal,
  ShieldCheck,
  SlidersHorizontal,
  Stethoscope,
  UserPlus,
  UserRound,
  Waypoints,
} from "lucide-react";
import { useT, type Translate } from "../shared/i18n.js";
import { CAPSULE_COMPARE_KEY, formatAccelerator } from "../shared/shortcut-labels.js";
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
const INVERTED_BRAND_CLASS = "is-inverted";
const AI_BRAND_LOGOS = {
  openai: new URL("../assets/ai-brands/openai.svg", import.meta.url).href,
  anthropic: new URL("../assets/ai-brands/anthropic.svg", import.meta.url).href,
  deepseek: new URL("../assets/ai-brands/deepseek.svg", import.meta.url).href,
  kimi: new URL("../assets/ai-brands/kimi.svg", import.meta.url).href,
  mistral: new URL("../assets/ai-brands/mistralai.svg", import.meta.url).href,
} as const;

export const WELCOME_TOUR_AI_BRANDS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    logo: AI_BRAND_LOGOS.openai,
    color: "#1f2937",
    invert: false,
  },
  {
    id: "claude",
    name: "Claude",
    logo: AI_BRAND_LOGOS.anthropic,
    color: "#d7a87f",
    invert: false,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    logo: AI_BRAND_LOGOS.deepseek,
    color: "#4f6bff",
    invert: true,
  },
  { id: "kimi", name: "Kimi", logo: AI_BRAND_LOGOS.kimi, color: "#171717", invert: true },
] as const;

/**
 * Le pied de la capsule, rejoué en maquette.
 *
 * En données plutôt qu'en JSX répété, pour deux raisons. La maquette et le
 * vrai pied ont déjà divergé sans que rien ne le dise — elle annonçait `⌥`
 * quand la capsule était passée à `⌘D` — et la présentation est justement
 * l'endroit où une touche fausse coûte le plus cher : c'est la première, et
 * parfois la seule, fois qu'on la lit. Un test lit maintenant cette liste, et
 * la touche de comparaison vient de la même constante que le pied réel.
 *
 * Le balisage rendu est inchangé : mêmes classes, même ordre.
 */
export const WELCOME_TOUR_CAPSULE_KEYS: readonly {
  readonly touche: string;
  readonly label: string;
  readonly variant?: string;
}[] = [
  { touche: "↵", label: "capsule.replace", variant: "key-primary" },
  { touche: CAPSULE_COMPARE_KEY, label: "capsule.compare" },
  { touche: "⌘C", label: "capsule.copy" },
  { touche: "esc", label: "capsule.close", variant: "key-close" },
];

export const WELCOME_TOUR_PROVIDERS = [
  {
    id: "anthropic",
    logo: AI_BRAND_LOGOS.anthropic,
    name: "Anthropic",
    color: "#d7a87f",
    invert: false,
  },
  {
    id: "openai",
    logo: AI_BRAND_LOGOS.openai,
    name: "OpenAI",
    color: "#1f2937",
    invert: false,
  },
  {
    id: "deepseek",
    logo: AI_BRAND_LOGOS.deepseek,
    name: "DeepSeek",
    color: "#4f6bff",
    invert: true,
  },
  {
    id: "mistral",
    logo: AI_BRAND_LOGOS.mistral,
    name: "Mistral",
    color: "#f2a51a",
    invert: false,
  },
] as const;

type TourDirection = "forward" | "backward";

interface WelcomeTourProps {
  onContinue(): void;
}

export function shouldShowWelcomeTour(
  required: boolean,
  dismissed: boolean,
  forced = false,
): boolean {
  return (required || forced) && !dismissed;
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
        {WELCOME_TOUR_CAPSULE_KEYS.map(({ touche, label, variant }) => (
          <span
            key={label}
            className={variant === undefined ? "capsule-key" : `capsule-key ${variant}`}
          >
            <kbd>{touche}</kbd>
            {t(label)}
          </span>
        ))}
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
  const activeBrand = WELCOME_TOUR_AI_BRANDS[0];

  return (
    <>
      <div className="tour-app-window tour-chat-window">
        <div className="tour-app-titlebar">
          <WindowControls />
          <MessageSquareText size={12} />
          <span>{t("onboarding.tour.chat.workspace")}</span>
          <em>{t("onboarding.tour.chat.newChat")}</em>
        </div>
        <div className="tour-chat-shell">
          <aside className="tour-chat-sidebar">
            <span className="tour-chat-new">
              <Plus size={9} />
              {t("onboarding.tour.chat.newChat")}
            </span>
            <small>{t("onboarding.tour.chat.recent")}</small>
            <span className="tour-chat-thread active">{t("onboarding.tour.chat.threadOne")}</span>
            <span className="tour-chat-thread">{t("onboarding.tour.chat.threadTwo")}</span>
          </aside>
          <section className="tour-chat-conversation">
            <header className="tour-chat-model-header">
              <span
                className="tour-chat-model-logo"
                style={{ "--tour-brand-color": activeBrand.color } as CSSProperties}
              >
                <img src={activeBrand.logo} alt="" />
              </span>
              <span className="tour-chat-model-name">
                <b>{activeBrand.name}</b>
                <small>GPT-5.1</small>
              </span>
              <ChevronDown size={10} />
              <div
                className="tour-chat-brand-stack"
                aria-label={t("onboarding.tour.chat.availableModels")}
              >
                {WELCOME_TOUR_AI_BRANDS.map((brand, index) => (
                  <span
                    key={brand.id}
                    title={brand.name}
                    style={
                      {
                        "--tour-brand-index": index,
                        "--tour-brand-color": brand.color,
                      } as CSSProperties
                    }
                  >
                    <img
                      className={brand.invert ? INVERTED_BRAND_CLASS : undefined}
                      src={brand.logo}
                      alt={brand.name}
                    />
                  </span>
                ))}
              </div>
            </header>
            <div className="tour-chat-body">
              <span
                className="tour-chat-avatar"
                style={{ "--tour-brand-color": activeBrand.color } as CSSProperties}
              >
                <img src={activeBrand.logo} alt="" />
              </span>
              <p>{t("onboarding.tour.chat.assistant")}</p>
              <p className="tour-chat-user">{t("onboarding.tour.chat.original")}</p>
            </div>
            <div className="tour-chat-composer">
              <span>{t("onboarding.tour.chat.placeholder")}</span>
              <SendHorizontal size={10} />
            </div>
          </section>
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
      <div className="tour-product-ai-ecosystem">
        <div className="tour-product-ai-stack">
          {WELCOME_TOUR_AI_BRANDS.map((brand, index) => (
            <span
              key={brand.id}
              title={brand.name}
              style={
                {
                  "--tour-brand-index": index,
                  "--tour-brand-color": brand.color,
                } as CSSProperties
              }
            >
              <img
                className={brand.invert ? INVERTED_BRAND_CLASS : undefined}
                src={brand.logo}
                alt={brand.name}
              />
            </span>
          ))}
        </div>
        <span>
          <b>{t("onboarding.tour.providers.ecosystemTitle")}</b>
          <small>{t("onboarding.tour.providers.ecosystemDetail")}</small>
        </span>
      </div>
      <h3 className="tour-product-settings-subhead">{t("settings.builtinProviders")}</h3>
      <div className="tour-product-provider-list">
        {WELCOME_TOUR_PROVIDERS.map((provider) => (
          <ProductProviderRow
            key={provider.id}
            logo={provider.logo}
            color={provider.color}
            invert={provider.invert}
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
  logo,
  color,
  invert,
  name,
  status,
}: Readonly<{
  logo: string;
  color: string;
  invert: boolean;
  name: string;
  status: string;
}>): React.JSX.Element {
  return (
    <div className="tour-product-provider-row">
      <b style={{ "--tour-brand-color": color } as CSSProperties}>
        <img className={invert ? INVERTED_BRAND_CLASS : undefined} src={logo} alt="" />
      </b>
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
