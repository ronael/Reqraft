import {
  REPROMPT_LEVEL_IDS,
  type ProfileCatalogEntry,
  type RepromptResult,
} from "@/apps/desktop/shared/ipc-contract.js";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../shared/i18n.js";
import { ProfileSheet } from "../shared/ProfilePicker.js";
import { ResultEditor } from "../shared/ResultEditor.js";
import { Toast, useToast } from "../shared/Toast.js";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

/**
 * Le curseur est-il dans un champ de saisie ?
 *
 * Le popover a deux champs, le prompt et le résultat, et ni l'un ni l'autre ne
 * doit se faire confisquer ⌘C, ⌘A ou ⌘V. Poser la question au DOM plutôt qu'à
 * un état React évite qu'un `blur` non émis — un champ démonté par une relance,
 * par exemple — laisse le popover se croire en édition.
 */
function dansUnChamp(node: Element | null): node is HTMLTextAreaElement | HTMLInputElement {
  return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement;
}

/** Du texte est-il sélectionné à l'écran, hors champ de saisie ? */
function selectionEnCours(): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.toString() !== "";
}

/**
 * Popover (DESKTOP.md lot 4): the level-2 surface, for when there is no
 * selection. Write or paste, pick a profile and a level, ⌘⏎ reformulates;
 * the last result waits here. Same engine path as the capsule — everything
 * goes through the IPC bridge.
 *
 * Le prompt et le résultat sont modifiables comme dans la capsule, et pour la
 * même raison : ce qui est affiché est ce qui part. Le résultat réutilise
 * `ResultEditor`, la pièce de la capsule ; le prompt reste le champ de
 * composition du panneau, déjà sans cadre, sans fond et sans halo — un second
 * composant n'ajouterait qu'une deuxième façon d'écrire la même chose.
 *
 * La géométrie est fixe : 320 × 260, non redimensionnable. Seule la zone
 * centrale défile, le pied ne bouge pas, et rien de ce qui suit ne doit rendre
 * une action inatteignable.
 */
export function PopoverApp(): React.JSX.Element {
  const t = useT();
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
  /**
   * Le résultat tel qu'il a été repris, ou `null` s'il n'a pas été touché.
   *
   * Deux valeurs plutôt qu'une copie initialisée depuis le résultat, comme dans
   * la capsule : `null` dit « rien n'a été modifié », et c'est ce qui permet à
   * la copie de ne rien porter, donc au processus principal de copier
   * exactement le texte qu'il a produit.
   */
  const [edited, setEdited] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const activeRunId = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { toast, show: annoncer, dismiss: fermerAnnonce } = useToast();

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
    if (running) {
      return;
    }
    // Un bouton qui ne fait rien ressemble à une panne. Le dire coûte une
    // annonce et évite de chercher pourquoi ⌘⏎ est resté sans effet.
    if (input.trim() === "") {
      annoncer(t("capsule.promptEmpty"), "warning");
      return;
    }
    // Une nouvelle génération repart du texte du modèle : garder le résultat
    // précédent, ou sa reprise, ferait copier un texte que plus rien à l'écran
    // ne montre — et laisserait l'ancien résultat sous un écran d'erreur.
    activeRunId.current = null;
    setStreamed("");
    setFailed(null);
    setLastResult(null);
    setEdited(null);
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
  }, [annoncer, input, profileId, level, running, t]);

  /**
   * Le texte à copier, ou `undefined` s'il n'a pas été repris.
   *
   * Un résultat vidé n'est pas une reformulation : le copier écraserait le
   * presse-papiers par rien, sans que le geste ait l'air d'avoir échoué.
   */
  const copier = useCallback(() => {
    const runId = activeRunId.current;
    if (runId === null || lastResult === null) {
      return;
    }
    if (edited !== null && edited.trim() === "") {
      annoncer(t("popover.resultEmpty"), "warning");
      return;
    }
    void window.reqraft
      .acceptResult(runId, "copy", edited ?? undefined)
      .then(({ applied }) => {
        annoncer(
          applied ? t("popover.copied") : t("clipboard.copyFailed"),
          applied ? "success" : "error",
        );
      })
      .catch(() => {
        annoncer(t("clipboard.copyFailed"), "error");
      });
  }, [annoncer, edited, lastResult, t]);

  /**
   * Les raccourcis du panneau, posés sur la fenêtre plutôt que sur un champ.
   *
   * ⌘⏎ doit relancer depuis n'importe où, y compris depuis le résultat que
   * l'on vient de corriger. ⌘C ne prend le relais que là où il ne prive
   * personne de rien : hors d'un champ et sans sélection en cours — sinon
   * copier « le résultat » remplacerait les trois mots que l'on venait de
   * sélectionner. `esc` fait sortir du champ sans rien jeter : le texte repris
   * reste tel quel, et les commandes du popover redeviennent disponibles.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // La feuille des profils a ses propres touches, et remplace le corps.
      if (picking) return;
      const cible = document.activeElement;
      if (event.key === "Escape") {
        if (dansUnChamp(cible)) {
          event.preventDefault();
          cible.blur();
        }
        return;
      }
      if (!event.metaKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        run();
        return;
      }
      if (event.key.toLowerCase() === "c" && !dansUnChamp(cible) && !selectionEnCours()) {
        event.preventDefault();
        copier();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [copier, picking, run]);

  /**
   * Une génération est une nouvelle lecture : elle commence par son début.
   *
   * Un résultat long laisse la zone centrale défilée très bas. Sans cette
   * remise à zéro, la génération suivante s'ouvrait au milieu de son texte —
   * la position d'un résultat que plus rien à l'écran ne montre.
   */
  useLayoutEffect(() => {
    if (contentRef.current !== null) contentRef.current.scrollTop = 0;
  }, [lastResult, running]);

  const selectedProfile = profiles.find((entry) => entry.id === profileId);
  /** Le texte qui fait foi : celui affiché, repris ou non. */
  const finalText = edited ?? lastResult?.rewritten ?? "";
  const resultatVisible = !running && lastResult !== null;

  if (picking) {
    return (
      <main className="popover">
        <ProfileSheet
          entries={profiles}
          selectedId={profileId}
          onSelect={(id) => {
            // Volontairement sans relance, contrairement à la capsule : ici le
            // profil se choisit avant d'écrire, et relancer jetterait le
            // résultat que l'on est peut-être en train de corriger.
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
            <kbd>↑↓</kbd> {t("popover.browse")} · <kbd>⏎</kbd> {t("popover.choose")} ·{" "}
            <kbd>esc</kbd> {t("popover.back")}
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
          aria-label={t("popover.promptLabel")}
          placeholder={t("popover.placeholder")}
          rows={2}
          value={input}
          autoFocus
          onChange={(event) => {
            setInput(event.target.value);
          }}
        />
      </div>

      <div className="popover-controls">
        {/* Le même bouton que dans la capsule : un seul contrôle de profil
            dans toute l'application, pas un par surface. */}
        <button
          type="button"
          className="profile-chip profile-chip-pick"
          title={t("capsule.changeProfile")}
          onClick={() => {
            setPicking(true);
          }}
        >
          {selectedProfile?.name ?? profileId}
        </button>
        <button
          type="button"
          className="level-toggle"
          title={t("capsule.levelTitle")}
          onClick={() => {
            const nextIndex = (REPROMPT_LEVEL_IDS.indexOf(level) + 1) % REPROMPT_LEVEL_IDS.length;
            setLevel(REPROMPT_LEVEL_IDS[nextIndex] ?? "standard");
          }}
        >
          {level}
        </button>
      </div>

      <div className="popover-content" ref={contentRef}>
        {running && (
          <div className="popover-section">
            <div className="popover-label">{t("popover.receiving")}</div>
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

        {resultatVisible && (
          <div className="popover-section">
            <div className="popover-label">{t("popover.lastResult")}</div>
            <ResultEditor
              value={finalText}
              label={t("popover.resultLabel")}
              readOnly={false}
              surfaceClassName="popover-result"
              onChange={setEdited}
            />
          </div>
        )}
      </div>

      {/* Hors du contenu : l'annonce ne défile pas avec le résultat, ne
          déplace rien, et se pose au-dessus du pied sans le recouvrir. */}
      <Toast toast={toast} onDismiss={fermerAnnonce} />

      <footer className="popover-footer">
        {resultatVisible && (
          <button type="button" className="capsule-key key-primary" onClick={copier}>
            <kbd>⌘C</kbd>
            {t("popover.copy")}
          </button>
        )}
        {/* Le popover s'ouvre à la souris : son action principale doit s'y
            prendre aussi, pas seulement au clavier. */}
        <button type="button" className="capsule-key popover-reformulate" onClick={run}>
          <kbd>⌘⏎</kbd>
          {t("capsule.reformulate")}
        </button>
        <button
          type="button"
          className="popover-settings"
          onClick={() => void window.reqraft.openSettings()}
        >
          {t("popover.settings")}
        </button>
      </footer>
    </main>
  );
}
