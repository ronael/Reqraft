import { useCallback, useEffect, useRef, useState } from "react";
import {
  REPROMPT_LEVEL_IDS,
  type ProfileSummary,
  type RepromptResult,
} from "../../shared/ipc-contract.js";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

/**
 * Popover (DESKTOP.md lot 4): the level-2 surface, for when there is no
 * selection. Write or paste, pick a profile and a level, ⌘⏎ reformulates;
 * the last result waits here. Same engine path as the capsule — everything
 * goes through the IPC bridge.
 */
export function PopoverApp(): React.JSX.Element {
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profileId, setProfileId] = useState("auto");
  const [level, setLevel] = useState<Level>("standard");
  const [running, setRunning] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [lastResult, setLastResult] = useState<RepromptResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);

  useEffect(() => {
    window.reqraft
      .listProfiles()
      .then(setProfiles)
      .catch(() => {
        setProfiles([]);
      });
  }, []);

  useEffect(() => {
    const offDelta = window.reqraft.onRunDelta((payload) => {
      if (payload.runId === activeRunId.current) {
        setStreamed((previous) => previous + payload.chunk);
      }
    });
    const offDone = window.reqraft.onRunDone((payload) => {
      if (payload.runId === activeRunId.current) {
        setLastResult(payload.result);
        setRunning(false);
      }
    });
    const offError = window.reqraft.onRunError((payload) => {
      if (payload.runId === activeRunId.current) {
        setFailed(payload.error.message);
        setRunning(false);
      }
    });
    const offCancelled = window.reqraft.onRunCancelled((payload) => {
      if (payload.runId === activeRunId.current) {
        setRunning(false);
      }
    });
    return () => {
      offDelta();
      offDone();
      offError();
      offCancelled();
    };
  }, []);

  const run = useCallback(() => {
    if (input.trim() === "" || running) {
      return;
    }
    setStreamed("");
    setFailed(null);
    setRunning(true);
    window.reqraft
      .startReprompt({ input, profileId, level })
      .then(({ runId }) => {
        activeRunId.current = runId;
      })
      .catch((reason: unknown) => {
        setRunning(false);
        setFailed(reason instanceof Error ? reason.message : String(reason));
      });
  }, [input, profileId, level, running]);

  const copyLastResult = useCallback(() => {
    const runId = activeRunId.current;
    if (runId !== null) {
      void window.reqraft.acceptResult(runId, "copy");
    }
  }, []);

  return (
    <main className="popover">
      <div className="popover-input-zone">
        <textarea
          className="popover-input"
          placeholder="Écris, ou ⌘V pour coller…"
          rows={2}
          value={input}
          autoFocus
          onChange={(event) => {
            setInput(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.metaKey) {
              run();
            }
          }}
        />
      </div>

      <div className="popover-controls">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className={profile.id === profileId ? "chip chip-active" : "chip"}
            title={profile.description}
            onClick={() => {
              setProfileId(profile.id);
            }}
          >
            {profile.name}
          </button>
        ))}
        <button
          type="button"
          className="chip chip-level"
          title="Niveau de reformulation (cliquer pour changer)"
          onClick={() => {
            const nextIndex = (REPROMPT_LEVEL_IDS.indexOf(level) + 1) % REPROMPT_LEVEL_IDS.length;
            setLevel(REPROMPT_LEVEL_IDS[nextIndex] ?? "standard");
          }}
        >
          {level}
        </button>
      </div>

      {running && (
        <div className="popover-section">
          <div className="popover-label">Réception…</div>
          <p className="popover-result">
            {streamed}
            <span className="caret" aria-hidden="true" />
          </p>
        </div>
      )}

      {failed !== null && (
        <div className="popover-section" role="alert">
          <p className="error-detail">{failed}</p>
        </div>
      )}

      {!running && lastResult !== null && (
        <div className="popover-section">
          <div className="popover-label">Dernier résultat</div>
          <p className="popover-result">{lastResult.rewritten}</p>
          <button type="button" className="chip" onClick={copyLastResult}>
            ⌘C copier
          </button>
        </div>
      )}

      <footer className="popover-footer">
        <span>
          <kbd>⌘⏎</kbd> reformuler
        </span>
        <button
          type="button"
          className="popover-settings"
          onClick={() => void window.reqraft.openSettings()}
        >
          Réglages…
        </button>
      </footer>
    </main>
  );
}
