import { useEffect, useRef, useState } from "react";
import type { RepromptResult, UiError } from "../../shared/ipc-contract.js";

type RunPhase = "idle" | "running" | "done" | "error" | "cancelled";

const QUALITY_LABELS: Record<RepromptResult["quality"]["status"], string> = {
  good: "fidèle",
  review: "à relire",
  risky: "risqué",
};

/**
 * Lot 1 capsule: a single minimal window proving the full round trip
 * renderer → main → provider → renderer. The fidelity verdict is displayed
 * before the rewritten text (DESKTOP.md §2.5); the real capsule machine
 * (§8.2) lands with lot 3.
 */
export function App(): React.JSX.Element {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<RepromptResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const activeRunId = useRef<string | null>(null);

  useEffect(() => {
    const offDelta = window.reqraft.onRunDelta((payload) => {
      if (payload.runId === activeRunId.current) {
        setStreamed((previous) => previous + payload.chunk);
      }
    });
    const offDone = window.reqraft.onRunDone((payload) => {
      if (payload.runId === activeRunId.current) {
        setResult(payload.result);
        setPhase("done");
      }
    });
    const offError = window.reqraft.onRunError((payload) => {
      if (payload.runId === activeRunId.current) {
        setError(payload.error);
        setPhase("error");
      }
    });
    const offCancelled = window.reqraft.onRunCancelled((payload) => {
      if (payload.runId === activeRunId.current) {
        setPhase("cancelled");
      }
    });
    // Every subscription is removed on unmount (DESKTOP.md §5.6).
    return () => {
      offDelta();
      offDone();
      offError();
      offCancelled();
    };
  }, []);

  const start = (): void => {
    setStreamed("");
    setResult(null);
    setError(null);
    setPhase("running");
    window.reqraft
      .startReprompt({ input })
      .then(({ runId }) => {
        activeRunId.current = runId;
      })
      .catch((reason: unknown) => {
        setPhase("error");
        setError({
          title: "Erreur",
          message: reason instanceof Error ? reason.message : String(reason),
        });
      });
  };

  const cancel = (): void => {
    const runId = activeRunId.current;
    if (runId !== null) {
      void window.reqraft.cancelReprompt(runId);
    }
  };

  const copyResult = (): void => {
    const runId = activeRunId.current;
    if (runId !== null) {
      void window.reqraft.acceptResult(runId, "copy");
    }
  };

  const running = phase === "running";

  return (
    <main className="capsule">
      <header className="capsule-header">
        <span className="capsule-dot" aria-hidden="true" />
        <h1>Reqraft</h1>
      </header>

      <textarea
        className="capsule-input"
        placeholder="Colle ou écris une demande à reformuler…"
        value={input}
        rows={4}
        onChange={(event) => {
          setInput(event.target.value);
        }}
      />

      <div className="capsule-actions">
        {running ? (
          <button type="button" className="button-secondary" onClick={cancel}>
            Interrompre
          </button>
        ) : (
          <button
            type="button"
            className="button-primary"
            disabled={input.trim().length === 0}
            onClick={start}
          >
            Reformuler
          </button>
        )}
      </div>

      {running && (
        <section className="capsule-panel" aria-live="polite">
          <h2>Génération…</h2>
          <pre className="capsule-stream">{streamed || "En attente du premier fragment…"}</pre>
        </section>
      )}

      {phase === "error" && error !== null && (
        <section className="capsule-panel capsule-panel-danger" role="alert">
          <h2>{error.title}</h2>
          <p>{error.message}</p>
          {error.nextAction !== undefined && <p className="muted">{error.nextAction}</p>}
        </section>
      )}

      {phase === "cancelled" && (
        <section className="capsule-panel">
          <p className="muted">Génération interrompue.</p>
        </section>
      )}

      {phase === "done" && result !== null && (
        <section className="capsule-panel">
          <p className={`verdict verdict-${result.quality.status}`}>
            Verdict de fidélité : {QUALITY_LABELS[result.quality.status]}
          </p>
          <pre className="capsule-stream">{result.rewritten}</pre>
          {result.changes.length > 0 && (
            <ul className="capsule-changes">
              {result.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          )}
          <div className="capsule-actions">
            <button type="button" className="button-primary" onClick={copyResult}>
              Copier le résultat
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
