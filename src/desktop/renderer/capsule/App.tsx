import { useCallback, useEffect, useRef, useState } from "react";
import {
  REPROMPT_LEVEL_IDS,
  type RepromptResult,
  type UiError,
} from "../../shared/ipc-contract.js";
import { transition, type CapsuleState } from "../../shared/capsule-machine.js";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

const QUALITY_LABELS: Record<RepromptResult["quality"]["status"], string> = {
  good: "✓ fidèle",
  review: "à relire",
  risky: "risqué",
};

/**
 * The capsule (DESKTOP.md lot 3): the product's main surface. UI states are
 * driven by the §8.2 state machine — any transition the table refuses is a
 * no-op here. The fidelity verdict always renders BEFORE the rewritten text
 * (§2.5), and the displayed profile is the one resolved by the main process
 * at run start, never a placeholder (the spike's hardcoded-profile bug).
 */
export function App(): React.JSX.Element {
  const [state, setState] = useState<CapsuleState>("capture");
  const [input, setInput] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [detectedProfile, setDetectedProfile] = useState(false);
  const [level, setLevel] = useState<Level>("standard");
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<RepromptResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);
  const comparing = useRef(false);
  /** Mirror of `streamed` readable from event callbacks. */
  const streamedRef = useRef("");
  const setStreamedBoth = useCallback((update: (previous: string) => string): void => {
    setStreamed((previous) => {
      const next = update(previous);
      streamedRef.current = next;
      return next;
    });
  }, []);

  const dispatch = useCallback((event: Parameters<typeof transition>[1]) => {
    setState((current) => transition(current, event) ?? current);
  }, []);

  const startRun = useCallback(
    (text: string, chosenLevel: Level) => {
      setStreamedBoth(() => "");
      setResult(null);
      setError(null);
      setNotice(null);
      window.reqraft
        .startReprompt({ input: text, level: chosenLevel })
        .then((response) => {
          activeRunId.current = response.runId;
          // analyse → profil-détecté → génération (§8.2): the real profile is
          // known before the first network byte.
          setProfile(response.profile);
          setDetectedProfile(response.detectedProfile);
          dispatch("profil-détecté");
        })
        .catch((reason: unknown) => {
          setError({
            title: "Erreur",
            message: reason instanceof Error ? reason.message : String(reason),
          });
          dispatch("échec");
        });
    },
    [dispatch, setStreamedBoth],
  );

  // capture → analyse or saisie, once at mount.
  useEffect(() => {
    window.reqraft
      .captureSelection()
      .then((capture) => {
        if ("text" in capture) {
          setInput(capture.text);
          setOrigin(capture.sourceApp);
          dispatch("capturé");
          startRun(capture.text, "standard");
        } else {
          dispatch("rien-à-capturer");
        }
      })
      .catch(() => {
        dispatch("rien-à-capturer");
      });
  }, [dispatch, startRun]);

  // Run events, filtered by runId; every subscription is removed on unmount
  // (§5.6).
  useEffect(() => {
    const offDelta = window.reqraft.onRunDelta((payload) => {
      if (payload.runId === activeRunId.current) {
        if (streamedRef.current === "") {
          dispatch("premier-fragment");
        }
        setStreamedBoth((previous) => previous + payload.chunk);
      }
    });
    const offDone = window.reqraft.onRunDone((payload) => {
      if (payload.runId === activeRunId.current) {
        setResult(payload.result);
        dispatch("résultat-complet");
      }
    });
    const offError = window.reqraft.onRunError((payload) => {
      if (payload.runId === activeRunId.current) {
        setError(payload.error);
        dispatch("échec");
      }
    });
    const offCancelled = window.reqraft.onRunCancelled((payload) => {
      if (payload.runId === activeRunId.current) {
        // §8.2: partial text lands on prêt, otherwise the capsule closes.
        if (streamedRef.current === "") {
          window.close();
        } else {
          dispatch("résultat-complet");
        }
      }
    });
    return () => {
      offDelta();
      offDone();
      offError();
      offCancelled();
    };
  }, [dispatch, setStreamedBoth]);

  const accept = useCallback(() => {
    const runId = activeRunId.current;
    if (runId === null) {
      return;
    }
    dispatch("accepter");
    window.reqraft
      .acceptResult(runId, "replace")
      .then(async ({ applied }) => {
        if (applied) {
          dispatch("appliqué");
          window.close();
          return;
        }
        // Floor mode (permissions, Wayland, unknown source app): copy instead
        // of replacing, and say so (§2.6, §5.4).
        const copy = await window.reqraft.acceptResult(runId, "copy");
        if (copy.applied) {
          setNotice("Remplacement indisponible — résultat copié, ⌘V pour coller.");
          dispatch("appliqué");
          window.setTimeout(() => {
            window.close();
          }, 1200);
        }
      })
      .catch(() => {
        setNotice("Le remplacement a échoué — le résultat reste affiché.");
      });
  }, [dispatch]);

  const cancelRun = useCallback(() => {
    const runId = activeRunId.current;
    if (runId !== null) {
      void window.reqraft.cancelReprompt(runId);
    }
  }, []);

  /** Keys handled in prêt/comparaison: ⏎ ⌘C ⌘R ⇥. */
  const handleReadyKey = useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === "Enter" && !event.metaKey) {
        accept();
        return;
      }
      if (event.key === "c" && event.metaKey) {
        const runId = activeRunId.current;
        if (runId !== null) {
          void window.reqraft.acceptResult(runId, "copy");
          setNotice("Résultat copié.");
        }
        return;
      }
      if (event.key === "r" && event.metaKey) {
        event.preventDefault();
        startRun(input, level);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const nextIndex = (REPROMPT_LEVEL_IDS.indexOf(level) + 1) % REPROMPT_LEVEL_IDS.length;
        const next = REPROMPT_LEVEL_IDS[nextIndex] ?? "standard";
        setLevel(next);
        startRun(input, next);
      }
    },
    [accept, input, level, startRun],
  );

  // Keyboard: ⏎ remplacer, ⌥ comparer (maintenu), ⌘C copier, ⌘R relancer,
  // ⇥ niveau, esc fermer, ⌘. interrompre.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Alt" && state === "prêt" && !comparing.current) {
        comparing.current = true;
        dispatch("comparer");
        return;
      }
      if (event.key === "Escape") {
        cancelRun();
        window.close();
        return;
      }
      if (event.key === "." && event.metaKey) {
        cancelRun();
        return;
      }
      if (state === "prêt" || state === "comparaison") {
        handleReadyKey(event);
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === "Alt" && comparing.current) {
        comparing.current = false;
        dispatch("fin-comparaison");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [state, cancelRun, dispatch, handleReadyKey]);

  const running = state === "génération" || state === "streaming" || state === "analyse";
  const expansion = result?.quality.signals.some(
    (signal) => signal.code === "disproportionate_expansion",
  );
  const showResult =
    (state === "prêt" || state === "comparaison" || state === "application") && result !== null;
  const finalResult = showResult ? result : null;

  function computeVerdictLabel(): string {
    if (finalResult === null) {
      return "";
    }
    if (expansion === true) {
      return "! expansion détectée";
    }
    return QUALITY_LABELS[finalResult.quality.status];
  }
  const verdictLabel = computeVerdictLabel();
  const verdictDetail =
    expansion === true ? "fonctionnalités non demandées" : "aucune invention détectée";

  return (
    <main className="capsule">
      <header className="capsule-band">
        <span className="capsule-brand">rq</span>
        <span className="capsule-origin">
          {origin !== null ? `sélection · ${origin}` : "saisie libre"}
        </span>
        <span className="capsule-profile">
          {running && profile === null && <span className="pulse">analyse locale…</span>}
          {profile !== null && (
            <>
              profil <b>{profile}</b>
              {detectedProfile && (
                <span className="capsule-profile-note"> · détecté hors ligne</span>
              )}
            </>
          )}
        </span>
      </header>
      {running && <div className="capsule-bar" aria-hidden="true" />}

      <section className="capsule-body">
        {state === "saisie" && (
          <>
            <textarea
              className="capsule-input"
              placeholder="Colle ou écris une demande à reformuler…"
              value={input}
              rows={4}
              autoFocus
              onChange={(event) => {
                setInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.metaKey && input.trim() !== "") {
                  dispatch("validation");
                  startRun(input, level);
                }
              }}
            />
            <div className="capsule-actions">
              <button
                type="button"
                className="button-primary"
                disabled={input.trim() === ""}
                onClick={() => {
                  dispatch("validation");
                  startRun(input, level);
                }}
              >
                Reformuler ⌘⏎
              </button>
            </div>
          </>
        )}

        {state !== "saisie" && input !== "" && state !== "comparaison" && (
          <div className="capsule-source">
            <span className="capsule-source-label">avant</span>
            <span className="capsule-source-text">{input}</span>
          </div>
        )}

        {(state === "analyse" || state === "génération") && (
          <p className="muted">Lecture de la sélection…</p>
        )}

        {state === "streaming" && (
          <pre className="capsule-stream">
            {streamed}
            <span className="caret" aria-hidden="true" />
          </pre>
        )}

        {(state === "prêt" || state === "application") && result !== null && (
          <pre className="capsule-stream">{result.rewritten}</pre>
        )}

        {state === "comparaison" && result !== null && (
          <div className="capsule-diff">
            <div className="diff-before">− {input}</div>
            <div className="diff-after">+ {result.rewritten}</div>
          </div>
        )}

        {state === "erreur" && error !== null && (
          <div role="alert">
            <div className="error-title">× {error.title}</div>
            <p className="error-detail">{error.message}</p>
            {error.nextAction !== undefined && <p className="muted">{error.nextAction}</p>}
          </div>
        )}

        {notice !== null && <p className="capsule-notice">{notice}</p>}
      </section>

      <footer className="capsule-footer">
        <div className="capsule-verdict">
          {state === "streaming" && <span className="pulse accent">réception…</span>}
          {finalResult !== null && (
            <>
              <span className={`verdict-${finalResult.quality.status}`}>{verdictLabel}</span>
              <span className="muted">{verdictDetail}</span>
              <span className="capsule-meta">
                niveau {finalResult.level} · {finalResult.model}
              </span>
            </>
          )}
          {state === "erreur" && <span className="muted">esc pour fermer</span>}
        </div>
        <div className="capsule-keys">
          {(state === "prêt" || state === "comparaison") && (
            <>
              {expansion === true && (
                <span className="key-primary">
                  <kbd>⇥</kbd> baisser le niveau
                </span>
              )}
              <span className="key-primary">
                <kbd>⏎</kbd> remplacer
              </span>
              <span>
                <kbd>⌥</kbd> comparer
              </span>
              <span>
                <kbd>⌘C</kbd> copier
              </span>
              <span>
                <kbd>⌘R</kbd> relancer
              </span>
              <span>
                <kbd>⇥</kbd> niveau
              </span>
            </>
          )}
          {running && (
            <span>
              <kbd>⌘.</kbd> interrompre
            </span>
          )}
          <span className="key-close">
            <kbd>esc</kbd> fermer
          </span>
        </div>
      </footer>
    </main>
  );
}
