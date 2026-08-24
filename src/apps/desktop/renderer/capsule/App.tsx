import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTO_PROFILE_ID,
  REPROMPT_LEVEL_IDS,
  type RepromptResult,
  type UiError,
} from "@/apps/desktop/shared/ipc-contract.js";
import { transition, type CapsuleState } from "@/apps/desktop/shared/capsule-machine.js";

/** Nommé une fois : l'état apparaît dans trois conditions différentes. */
const GENERATING = "génération";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

const QUALITY_LABELS: Record<RepromptResult["quality"]["status"], string> = {
  good: "✓ fidèle",
  review: "à relire",
  risky: "risqué",
};

export function cycleRepromptLevel(current: Level, direction: 1 | -1): Level {
  const currentIndex = REPROMPT_LEVEL_IDS.indexOf(current);
  const safeIndex = currentIndex === -1 ? REPROMPT_LEVEL_IDS.indexOf("standard") : currentIndex;
  const nextIndex = (safeIndex + direction + REPROMPT_LEVEL_IDS.length) % REPROMPT_LEVEL_IDS.length;
  return REPROMPT_LEVEL_IDS[nextIndex] ?? "standard";
}

/**
 * The capsule (DESKTOP.md lot 3): the product's main surface. UI states are
 * driven by the §8.2 state machine — any transition the table refuses is a
 * no-op here. The fidelity verdict always renders BEFORE the rewritten text
 * (§2.5).
 *
 * The displayed profile is never hardcoded (the spike's known bug), but it is
 * not always known at start either: an explicit profile is shown immediately,
 * whereas `auto` is decided by the model during the run and only becomes
 * displayable when the result arrives.
 */
export function App(): React.JSX.Element {
  const [state, setState] = useState<CapsuleState>("capture");
  const [input, setInput] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);
  const [requestedProfile, setRequestedProfile] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>("standard");
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<RepromptResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Temps écoulé depuis le déclenchement, en millisecondes.
   *
   * Une attente sans repère paraît plus longue qu'elle ne l'est, et rien ne
   * distinguait « le modèle réfléchit » de « c'est bloqué ». La durée finale
   * existait déjà, mais seulement une fois le résultat arrivé — trop tard pour
   * rassurer pendant l'attente.
   */
  const [elapsedMs, setElapsedMs] = useState(0);
  /**
   * Instant du départ, plutôt qu'un simple drapeau « en cours ».
   *
   * Ancré sur `running`, le chrono ne repartait pas si un nouveau
   * déclenchement arrivait pendant qu'un run tournait : il continuait de
   * compter depuis le précédent et annonçait 17 s pour une capture qui venait
   * de commencer.
   */
  const [startedAt, setStartedAt] = useState<number | null>(null);
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
      setStartedAt(Date.now());
      setElapsedMs(0);
      setStreamedBoth(() => "");
      setResult(null);
      setError(null);
      setNotice(null);
      window.reqraft
        .startReprompt({ input: text, level: chosenLevel })
        .then((response) => {
          activeRunId.current = response.runId;
          // analyse → profil-détecté → génération (§8.2). The event only means
          // the run started: for `auto`, the applied profile is still unknown
          // here and lands with the result.
          setRequestedProfile(response.requestedProfile);
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

  // Session lifecycle: the window persists between triggers (hidden, never
  // destroyed), so every capsule:opened starts a FRESH session — otherwise a
  // second shortcut would show the previous result.
  const resetSession = useCallback(() => {
    activeRunId.current = null;
    setInput("");
    setOrigin(null);
    setRequestedProfile(null);
    setStreamedBoth(() => "");
    setResult(null);
    setError(null);
    setNotice(null);
    setLevel("standard");
  }, [setStreamedBoth]);

  const beginCapture = useCallback(() => {
    resetSession();
    setState("capture");
    window.reqraft
      .captureSelection()
      .then((capture) => {
        if ("text" in capture) {
          setInput(capture.text);
          setOrigin(capture.sourceApp);
          dispatch("capturé");
          startRun(capture.text, "standard");
        } else {
          // Une capture vide a deux causes très différentes : rien n'était
          // sélectionné, ou macOS a refusé. Seule la seconde demande une
          // action, et elle est invisible si on ne la dit pas.
          if (capture.reason !== undefined) setNotice(capture.reason);
          dispatch("rien-à-capturer");
        }
      })
      .catch(() => {
        dispatch("rien-à-capturer");
      });
  }, [dispatch, resetSession, startRun]);

  useEffect(() => {
    return window.reqraft.onCapsuleOpened((payload) => {
      if (payload.mode === "capture") {
        beginCapture();
      } else {
        // Volontairement pas de `resetSession()` : la fenêtre se cache dès
        // qu'on clique ailleurs, et repartir de zéro à la réouverture jette ce
        // qui venait d'être écrit. Le brouillon est effacé après un envoi.
        setNotice(null);
        setState("saisie");
      }
    });
  }, [beginCapture, resetSession]);

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
        const next = cycleRepromptLevel(level, event.shiftKey ? -1 : 1);
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
        setState("fermée");
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

  const running = state === GENERATING || state === "streaming" || state === "analyse";

  useEffect(() => {
    if (!running || startedAt === null) {
      return undefined;
    }
    // 100ms : le dixième de seconde change à l'écran sans faire travailler le
    // rendu plus que nécessaire.
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 100);
    return () => {
      clearInterval(timer);
    };
  }, [running, startedAt]);

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

  // `result.profile` is the profile actually applied and outranks anything
  // known at start. Until it arrives, an explicit request is already its own
  // answer, while `auto` has none to show yet.
  const autoRequested = requestedProfile === AUTO_PROFILE_ID;
  const appliedProfile = result?.profile ?? null;
  const displayedProfile = appliedProfile ?? (autoRequested ? null : requestedProfile);
  const awaitingDetection = autoRequested && appliedProfile === null;

  return (
    <main className="capsule">
      <header className="capsule-band">
        <span className="capsule-brand">rq</span>
        <span className="capsule-origin">
          {origin !== null ? `sélection · ${origin}` : "nouvelle reformulation"}
        </span>
        <span className="capsule-profile">
          {running && awaitingDetection && (
            <>
              profil <b>auto</b>
              <span className="capsule-profile-note pulse"> · analyse…</span>
            </>
          )}
          {displayedProfile !== null && (
            <>
              profil <b>{displayedProfile}</b>
              {autoRequested && (
                <span className="capsule-profile-note"> · détecté automatiquement</span>
              )}
            </>
          )}
        </span>
        {state === "saisie" && (
          <span className="capsule-escape">
            <kbd>esc</kbd>
          </span>
        )}
      </header>
      {(running || state === "capture") && <div className="capsule-bar" aria-hidden="true" />}

      <section className={state === "saisie" ? "capsule-body capsule-flush" : "capsule-body"}>
        {state === "saisie" && (
          <>
            <textarea
              className="capsule-input"
              placeholder="Qu'est-ce que tu veux mieux formuler ?"
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
          </>
        )}

        {state !== "saisie" && input !== "" && state !== "comparaison" && (
          <div className="capsule-source">
            <span className="capsule-source-label">avant</span>
            <span className="capsule-source-text">{input}</span>
          </div>
        )}

        {state === "capture" && <p className="muted">Lecture de la sélection…</p>}

        {state === "analyse" && <p className="muted">Analyse de l&apos;intention…</p>}

        {state === GENERATING && (
          <p className="muted">
            {displayedProfile !== null
              ? `${displayedProfile} détecté · préparation…`
              : "Préparation…"}
          </p>
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

      {state === "saisie" ? (
        <div className="capsule-hints">
          <span className="capsule-hint-chip">{requestedProfile ?? "auto"}</span>
          <span>{level}</span>
          <span className="capsule-hint-key">
            <kbd>⌘⏎</kbd> reformuler
          </span>
        </div>
      ) : (
        <footer className="capsule-footer">
          <div className="capsule-verdict">
            {(state === GENERATING || state === "streaming") && (
              <>
                <span className="pulse accent">réception…</span>
                <span className="capsule-elapsed">{(elapsedMs / 1000).toFixed(1)} s</span>
              </>
            )}
            {finalResult !== null && (
              <>
                <span className={`verdict-${finalResult.quality.status}`}>{verdictLabel}</span>
                <span className="muted">{verdictDetail}</span>
                <span className="capsule-meta">
                  niveau {finalResult.level} · {finalResult.model}
                  {finalResult.latencyMs !== undefined &&
                    ` · ${(finalResult.latencyMs / 1000).toFixed(1)} s`}
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
              <>
                <span>
                  <kbd>⌘.</kbd> interrompre
                </span>
                {/* La capsule travaille sans le focus : le dire évite d'attendre
                  devant elle pour rien. */}
                <span className="capsule-hint">tu peux changer d&apos;app</span>
              </>
            )}
            <span className="key-close">
              <kbd>esc</kbd> fermer
            </span>
          </div>
        </footer>
      )}
    </main>
  );
}
