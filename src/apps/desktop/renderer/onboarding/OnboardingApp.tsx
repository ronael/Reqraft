import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, TriangleAlert } from "lucide-react";
import { groupProfiles } from "../shared/profiles.js";
import {
  REPROMPT_LEVEL_IDS,
  type ProfileCatalogEntry,
  type CatalogProviderId,
  type OnboardingProviderOption,
  type OnboardingStateResponse,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * First launch, for someone who installed the application and nothing else.
 *
 * One scrolling column rather than a stepper: there are four questions, they
 * depend on each other (the models offered follow the provider, the key is
 * only asked for when the provider needs one), and hiding them behind steps
 * would make the dependency invisible while adding navigation to get lost in.
 *
 * The renderer holds no secret beyond the moment it is typed: the field's
 * value goes straight to the main process through `saveCredential`, which
 * answers with statuses only. It is never read back, never written to the
 * configuration, and never part of what this window renders afterwards.
 */

interface OnboardingForm {
  provider: CatalogProviderId;
  model: string;
  profile: string;
  level: (typeof REPROMPT_LEVEL_IDS)[number];
  compatibleId: string;
  compatibleName: string;
  compatibleBaseUrl: string;
}

const COMPATIBLE_PROVIDER_ID = "openai-compatible";

const LEVEL_LABELS: Record<(typeof REPROMPT_LEVEL_IDS)[number], string> = {
  minimal: "Minimale — corrige la forme, touche à peu",
  standard: "Standard — reformule et structure",
  complete: "Complète — restructure et détaille",
};

/**
 * The first thing standing between this form and a working installation.
 *
 * One message rather than a list: the fields are answered top to bottom, so
 * naming the next thing to fix is more useful than naming them all at once.
 */
export function findOnboardingProblem(
  form: OnboardingForm,
  provider: OnboardingProviderOption | undefined,
): string | undefined {
  if (!provider) return "Choisissez un fournisseur.";

  if (provider.id === COMPATIBLE_PROVIDER_ID) {
    if (!form.compatibleId.trim()) {
      return "Donnez un identifiant à votre fournisseur (par exemple « local »).";
    }
    if (!/^[a-z0-9-]+$/.test(form.compatibleId.trim())) {
      return "L'identifiant du fournisseur n'accepte que des minuscules, des chiffres et des tirets.";
    }
    const parsed = URL.parse(form.compatibleBaseUrl.trim());
    if (parsed?.protocol !== "http:" && parsed?.protocol !== "https:") {
      return "L'URL de base doit commencer par http:// ou https://.";
    }
  }

  if (!form.model.trim()) return "Indiquez le modèle à utiliser.";

  if (provider.requiresApiKey && !provider.credentialConfigured) {
    return `Enregistrez une clé API pour ${provider.label} : sans elle, l'application ne peut rien envoyer.`;
  }

  return undefined;
}

/** How a detected credential is described, so its origin is never a mystery. */
export function describeCredentialSource(provider: OnboardingProviderOption): string {
  // Asked first: a provider that needs no key is not a provider whose key is
  // missing, and saying "no key saved yet" sends someone looking for one that
  // does not exist.
  if (!provider.requiresApiKey && !provider.credentialConfigured) {
    return "Aucune clé nécessaire pour ce fournisseur.";
  }

  switch (provider.credentialSource) {
    case "environment":
      return `Clé détectée dans ${provider.envName ?? "votre environnement"}.`;
    case "keychain":
      return "Clé trouvée dans le trousseau de votre système.";
    case "config":
      return "Fournisseur déclaré dans votre configuration.";
    case "builtin":
      return "Aucune clé nécessaire.";
    default:
      return "Aucune clé enregistrée pour l'instant.";
  }
}

export function OnboardingApp(): React.JSX.Element {
  const [state, setState] = useState<OnboardingStateResponse | null>(null);
  // Read separately from the setup state: the profile catalogue is files on
  // disk, and a broken one must not stop the wizard from opening.
  const [profiles, setProfiles] = useState<ProfileCatalogEntry[]>([]);
  const [form, setForm] = useState<OnboardingForm | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"credential" | "finish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<OnboardingStateResponse> => {
    const next = await window.reqraft.onboardingState();
    setState(next);
    return next;
  }, []);

  useEffect(() => {
    window.reqraft
      .profileCatalog()
      .then((catalog) => {
        setProfiles(catalog.entries);
      })
      .catch(() => {
        setProfiles([]);
      });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const next = await refresh();
        setForm(
          (current) =>
            current ?? {
              provider: next.suggested.provider,
              model: next.suggested.model,
              profile: next.suggested.profile,
              level: next.suggested.level,
              compatibleId: "local",
              compatibleName: "",
              compatibleBaseUrl: "http://localhost:11434/v1",
            },
        );
      } catch (cause) {
        setError(messageOf(cause));
      }
    })();
  }, [refresh]);

  if (!state || !form) {
    // The error branch matters as much as the spinner: if the first read
    // fails there is nothing to retry from, and an indefinite "loading" is
    // the one state that tells the user nothing at all.
    return (
      <main className="onboarding">
        <div className="onboarding-loading">
          {error === null ? (
            <span className="muted">
              <Loader2 size={16} className="pulse" aria-hidden /> Lecture de votre configuration…
            </span>
          ) : (
            <div className="settings-warning" role="alert">
              <TriangleAlert size={13} aria-hidden /> Configuration illisible : {error}
            </div>
          )}
        </div>
      </main>
    );
  }

  const provider = state.providers.find((candidate) => candidate.id === form.provider);
  const problem = findOnboardingProblem(form, provider);
  const needsKey = provider?.requiresApiKey === true && !provider.credentialConfigured;

  const update = (patch: Partial<OnboardingForm>): void => {
    setForm({ ...form, ...patch });
    setError(null);
  };

  const onProviderChange = (id: string): void => {
    // Looked up rather than cast: the value comes from a <select> whose
    // options this same list built, so the option object is the typed id.
    const next = state.providers.find((candidate) => candidate.id === id);
    if (!next) return;
    // The model must follow the provider: keeping the previous one would send
    // an Anthropic identifier to OpenAI and fail on the first run.
    const recommended = next.models.find((model) => model.recommended) ?? next.models[0];
    update({ provider: next.id, model: recommended?.id ?? "" });
    setNotice(null);
  };

  const onSaveCredential = async (): Promise<void> => {
    if (!provider) return;
    setBusy("credential");
    setError(null);
    setNotice(null);
    try {
      await window.reqraft.saveCredential({ provider: provider.id, secret });
      // Cleared at once: the field has done its job, and a key left in a
      // rendered input is a key on screen.
      setSecret("");
      await refresh();
      setNotice(`Clé ${provider.label} vérifiée et enregistrée dans votre trousseau.`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  };

  const onFinish = async (): Promise<void> => {
    setBusy("finish");
    setError(null);
    try {
      const response = await window.reqraft.completeOnboarding({
        provider: form.provider,
        model: form.model.trim(),
        profile: form.profile,
        level: form.level,
        ...(form.provider === COMPATIBLE_PROVIDER_ID
          ? {
              compatibleProvider: {
                id: form.compatibleId.trim(),
                ...(form.compatibleName.trim() ? { name: form.compatibleName.trim() } : {}),
                baseUrl: form.compatibleBaseUrl.trim(),
              },
            }
          : {}),
      });
      setState(response.state);
      if (response.state.required) {
        // Saved, but still not runnable. The main process keeps the window
        // open in that case, so say what is still missing.
        setError(
          "Configuration enregistrée, mais incomplète : il manque encore une clé utilisable.",
        );
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="onboarding">
      <div className="settings-titlebar">
        <div className="settings-titlebar-spacer" aria-hidden />
        <div className="settings-title">Reqraft</div>
        <span className="onboarding-badge">configuration</span>
      </div>

      <div className="onboarding-body">
        <header className="onboarding-header">
          <h1 className="onboarding-heading">Configurons Reqraft</h1>
          <p className="onboarding-lede">
            Quelques choix suffisent. Vous les retrouverez tous dans les réglages.
          </p>
        </header>

        <div className="onboarding-card">
          <label className="onboarding-field">
            <span className="onboarding-label">
              <span className="onboarding-label-title">Fournisseur</span>
              <span className="onboarding-label-detail">
                Le service qui reformulera vos demandes.
              </span>
              {provider && (
                <span
                  className={
                    provider.credentialConfigured
                      ? "onboarding-source onboarding-source-ok"
                      : "onboarding-source"
                  }
                >
                  {provider.credentialConfigured && <CheckCircle2 size={12} aria-hidden />}
                  {describeCredentialSource(provider)}
                </span>
              )}
            </span>
            <select
              className="settings-select"
              value={form.provider}
              onChange={(event) => {
                onProviderChange(event.target.value);
              }}
            >
              {state.providers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>

          {form.provider === COMPATIBLE_PROVIDER_ID && (
            <>
              <label className="onboarding-field">
                <span className="onboarding-label">
                  <span className="onboarding-label-title">Identifiant interne</span>
                  <span className="onboarding-label-detail">
                    Le nom court sous lequel ce fournisseur est enregistré.
                  </span>
                </span>
                <input
                  className="settings-input mono"
                  value={form.compatibleId}
                  onChange={(event) => {
                    update({ compatibleId: event.target.value });
                  }}
                />
              </label>
              <label className="onboarding-field">
                <span className="onboarding-label">
                  <span className="onboarding-label-title">URL de base</span>
                  <span className="onboarding-label-detail">
                    L&apos;adresse de l&apos;API compatible OpenAI à appeler.
                  </span>
                </span>
                <input
                  className="settings-input mono"
                  value={form.compatibleBaseUrl}
                  onChange={(event) => {
                    update({ compatibleBaseUrl: event.target.value });
                  }}
                />
              </label>
            </>
          )}

          {needsKey && (
            <label className="onboarding-field onboarding-field-stacked">
              <span className="onboarding-label">
                <span className="onboarding-label-title">Clé API {provider.label}</span>
                <span className="onboarding-label-detail">
                  Vérifiée puis rangée dans le trousseau de votre système. Elle n&apos;est jamais
                  écrite dans votre fichier de configuration.
                </span>
              </span>
              <span className="onboarding-key-control">
                <input
                  className="settings-input mono"
                  type="password"
                  value={secret}
                  placeholder="Collez votre clé"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setSecret(event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={secret.trim() === "" || busy !== null}
                  onClick={() => {
                    void onSaveCredential();
                  }}
                >
                  {busy === "credential" ? (
                    <Loader2 size={13} className="pulse" aria-hidden />
                  ) : (
                    <KeyRound size={13} aria-hidden />
                  )}
                  Vérifier et enregistrer
                </button>
              </span>
            </label>
          )}

          <label className="onboarding-field">
            <span className="onboarding-label">
              <span className="onboarding-label-title">Modèle</span>
              <span className="onboarding-label-detail">Ce que le fournisseur exécutera.</span>
            </span>
            {provider && provider.models.length > 0 ? (
              <select
                className="settings-select"
                value={form.model}
                onChange={(event) => {
                  update({ model: event.target.value });
                }}
              >
                {provider.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.recommended ? " — recommandé" : ""}
                  </option>
                ))}
                {provider.models.every((model) => model.id !== form.model) && (
                  <option value={form.model}>{form.model}</option>
                )}
              </select>
            ) : (
              <input
                className="settings-input mono"
                value={form.model}
                placeholder="identifiant du modèle"
                onChange={(event) => {
                  update({ model: event.target.value });
                }}
              />
            )}
          </label>

          {profiles.length > 0 && (
            <label className="onboarding-field">
              <span className="onboarding-label">
                <span className="onboarding-label-title">Profil par défaut</span>
                <span className="onboarding-label-detail">
                  Le style appliqué quand vous n&apos;en choisissez pas un autre.
                </span>
              </span>
              <select
                className="settings-select"
                value={form.profile}
                onChange={(event) => {
                  update({ profile: event.target.value });
                }}
              >
                {groupProfiles(profiles).map((group) => (
                  <optgroup key={group.origin} label={group.label}>
                    {group.entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          <label className="onboarding-field">
            <span className="onboarding-label">
              <span className="onboarding-label-title">Niveau de réécriture</span>
              <span className="onboarding-label-detail">
                À quel point Reqraft retravaille ce que vous écrivez.
              </span>
            </span>
            <select
              className="settings-select"
              value={form.level}
              onChange={(event) => {
                update({ level: event.target.value as OnboardingForm["level"] });
              }}
            >
              {REPROMPT_LEVEL_IDS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {notice !== null && (
          <p className="onboarding-banner onboarding-banner-ok" role="status">
            <CheckCircle2 size={13} aria-hidden />
            {notice}
          </p>
        )}

        {error !== null && (
          <div className="onboarding-banner onboarding-banner-warn" role="alert">
            <TriangleAlert size={13} aria-hidden /> {error}
          </div>
        )}
      </div>

      {/*
        Pinned, not scrolled with the form: at 600px tall the last field sits
        below the fold, and an action you have to scroll to find is an action
        people do not find. The blocking reason sits beside it rather than at
        the bottom of the page, so the button and the reason it is disabled
        are read together.
      */}
      <footer className="onboarding-footer">
        <div className="onboarding-footer-inner">
          <span className="onboarding-hint">
            {problem ?? "Tout est prêt : vous pouvez terminer."}
          </span>
          <button
            type="button"
            className="button-primary"
            disabled={problem !== undefined || busy !== null}
            onClick={() => {
              void onFinish();
            }}
          >
            {busy === "finish" && <Loader2 size={13} className="pulse" aria-hidden />}
            Terminer la configuration
          </button>
        </div>
      </footer>
    </main>
  );
}

function messageOf(cause: unknown): string {
  // Electron prefixes a rejected `invoke` with its own frame; the sentence the
  // main process wrote is what the user needs, not the transport around it.
  const raw = cause instanceof Error ? cause.message : String(cause);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, "").replace(/^Error:\s*/, "");
}
