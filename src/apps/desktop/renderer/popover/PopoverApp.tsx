import {
  REPROMPT_LEVEL_IDS,
  type ProfileCatalogEntry,
  type RepromptResult,
} from "@/apps/desktop/shared/ipc-contract.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProfileSheet } from "../shared/ProfilePicker.js";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

/**
 * Popover (DESKTOP.md lot 4): the level-2 surface, for when there is no
 * selection. Write or paste, pick a profile and a level, ⌘⏎ reformulates;
 * the last result waits here. Same engine path as the capsule — everything
 * goes through the IPC bridge.
 */
export function PopoverApp(): React.JSX.Element {
  const [input, setInput] = useState("");
  const [profiles, setProfiles] = useState<ProfileCatalogEntry[]>([]);
  const [profileId, setProfileId] = useState("auto");
  // The list replaces the body rather than floating over it: the window is
  // 320×260 and not resizable, so an overlay would be cut off by its edge.
  const [picking, setPicking] = useState(false);
  const [level, setLevel] = useState<Level>("standard");
  const [running, setRunning] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [lastResult, setLastResult] = useState<RepromptResult | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);

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

  const selectedProfile = profiles.find((entry) => entry.id === profileId);

  if (picking) {
    return (
      <main className="popover">
        <ProfileSheet
          entries={profiles}
          selectedId={profileId}
          onSelect={(id) => {
            setProfileId(id);
            setPicking(false);
          }}
          onClose={() => {
            setPicking(false);
          }}
          onManage={() => void window.reqraft.openSettings()}
        />
        <footer className="popover-footer">
          <span>
            <kbd>↑↓</kbd> parcourir · <kbd>⏎</kbd> choisir · <kbd>esc</kbd> retour
          </span>
        </footer>
      </main>
    );
  }

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
        {/* Le même bouton que dans la capsule : un seul contrôle de profil
            dans toute l'application, pas un par surface. */}
        <button
          type="button"
          className="profile-chip profile-chip-pick"
          title="Changer de profil"
          onClick={() => {
            setPicking(true);
          }}
        >
          {selectedProfile?.name ?? profileId}
        </button>
        <button
          type="button"
          className="level-toggle"
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
        {/* Le popover s'ouvre à la souris : son action principale doit s'y
            prendre aussi, pas seulement au clavier. */}
        <button type="button" className="capsule-key" onClick={run}>
          <kbd>⌘⏎</kbd> reformuler
        </button>
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
