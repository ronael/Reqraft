import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProfileSheet } from "../shared/ProfilePicker.js";
import { Toast, toastDurationMs, useToast } from "../shared/Toast.js";
import { PromptEditor } from "./PromptEditor.js";
import { ResultEditor } from "./ResultEditor.js";
import { useT } from "../shared/i18n.js";
import { CAPSULE_COMPARE_KEY } from "../shared/shortcut-labels.js";
import { describeQualityFinding } from "../shared/quality.js";
import {
  AUTO_PROFILE_ID,
  type ProfileCatalogEntry,
  REPROMPT_LEVEL_IDS,
  type CapsuleOpenedPayload,
  type RepromptResult,
  type UiError,
} from "@/apps/desktop/shared/ipc-contract.js";
import { transition, type CapsuleState } from "@/apps/desktop/shared/capsule-machine.js";
import {
  comparisonEvent,
  keepsComparison,
  NO_COMPARISON,
  preventsBrowserDefault,
  reduceComparison,
  resolveCapsuleKeyDown,
  resolveCapsuleKeyUp,
  wantsComparison,
  type CapsuleIntent,
} from "./keyboard.js";

/** Nommé une fois : l'état apparaît dans trois conditions différentes. */
const GENERATING = "generating";

type Level = (typeof REPROMPT_LEVEL_IDS)[number];

/** Les libellés de qualité passent par le traducteur, comme le reste. */
const QUALITY_KEYS: Record<RepromptResult["quality"]["status"], string> = {
  good: "capsule.qualityGood",
  review: "capsule.qualityReview",
  risky: "capsule.qualityRisky",
};

const PROMPT_EMPTY_MESSAGE = "capsule.promptEmpty";

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
/**
 * Écoute les deux voies par lesquelles une ouverture peut arriver.
 *
 * La poussée du main se perd si le renderer n'écoute pas encore ; la demande
 * au montage rattrape ce cas. Le doublon est sans effet : l'appelant ignore un
 * identifiant déjà traité.
 */
function useOuvertureDeCapsule(traiter: (payload: CapsuleOpenedPayload) => void): void {
  useEffect(() => {
    void window.reqraft
      .capsulePending()
      .then((pending) => {
        if (pending !== null) traiter(pending);
      })
      .catch(() => undefined);
  }, [traiter]);

  useEffect(() => {
    return window.reqraft.onCapsuleOpened(traiter);
  }, [traiter]);
}

/**
 * Un raccourci affiché, et cliquable.
 *
 * Les indices du pied étaient inertes : la capsule s'ouvre au clavier, mais
 * rien n'oblige à la terminer au clavier — et un raccourci qu'on lit sans
 * pouvoir l'actionner est une notice, pas une commande.
 */
function CapsuleKey(
  props: Readonly<{
    touche: string;
    children: React.ReactNode;
    className?: string;
    /** Pour une commande qui reste enclenchée — ⌘D. Absent = pas une bascule. */
    pressed?: boolean;
    title?: string;
    onClick(): void;
  }>,
): React.JSX.Element {
  return (
    <button
      type="button"
      className={props.className === undefined ? "capsule-key" : `capsule-key ${props.className}`}
      aria-pressed={props.pressed}
      title={props.title}
      onClick={props.onClick}
    >
      <kbd>{props.touche}</kbd> {props.children}
    </button>
  );
}

interface CapsuleHeaderProps {
  origin: string | null;
  displayedProfile: string | null;
  autoRequested: boolean;
  detecting: boolean;
  closable: boolean;
  onClose(): void;
}

/** La bande du haut : d'où vient le texte, quel profil, et la sortie. */
function CapsuleHeader(props: Readonly<CapsuleHeaderProps>): React.JSX.Element {
  const t = useT();
  return (
    <header className="capsule-band">
      <span className="capsule-brand">rq</span>
      <span className="capsule-origin">
        {props.origin !== null
          ? t("capsule.selectionFrom", { app: props.origin })
          : t("capsule.newReformulation")}
      </span>
      <span className="capsule-profile">
        {props.detecting && (
          <>
            {t("capsule.profile")} <b>auto</b>
            <span className="capsule-profile-note pulse"> · {t("capsule.analysing")}</span>
          </>
        )}
        {props.displayedProfile !== null && (
          <>
            {t("capsule.profile")} <b>{props.displayedProfile}</b>
            {props.autoRequested && (
              <span className="capsule-profile-note"> · {t("capsule.autoDetected")}</span>
            )}
          </>
        )}
      </span>
      {props.closable && (
        <button type="button" className="capsule-key capsule-escape" onClick={props.onClose}>
          <kbd>esc</kbd>
        </button>
      )}
    </header>
  );
}

function CapsuleSource(
  props: Readonly<{
    input: string;
    label: string;
    editLabel: string;
    editable: boolean;
    readOnly: boolean;
    onChange(text: string): void;
    onEditingChange(editing: boolean): void;
  }>,
): React.JSX.Element {
  return (
    <div className="capsule-source">
      <span className="capsule-source-label">{props.label}</span>
      {props.editable ? (
        <PromptEditor
          value={props.input}
          label={props.editLabel}
          readOnly={props.readOnly}
          onChange={props.onChange}
          onEditingChange={props.onEditingChange}
        />
      ) : (
        <span className="capsule-source-text">{props.input}</span>
      )}
    </div>
  );
}

interface CapsuleFooterProps {
  state: CapsuleState;
  expansion: boolean;
  /** La comparaison est-elle épinglée (⌘D), plutôt que maintenue (⌥) ? */
  comparisonPinned: boolean;
  running: boolean;
  elapsedMs: number;
  finalResult: RepromptResult | null;
  verdictLabel: string;
  verdictDetail: string;
  profileLabel: string;
  pickable: boolean;
  level: Level;
  onPick(): void;
  onCycleLevel(): void;
  onSubmit(): void;
  onAccept(): void;
  onCompare(): void;
  onCopy(): void;
  onRerun(): void;
  onLevel(): void;
  onCancel(): void;
  onClose(): void;
}

/** Le pied : ce qu'on peut faire maintenant, au clavier comme à la souris. */
function CapsuleFooter(props: Readonly<CapsuleFooterProps>): React.JSX.Element {
  const t = useT();
  return (
    <>
      {props.state === "input" ? (
        <div className="capsule-hints">
          <button
            type="button"
            className="profile-chip profile-chip-pick"
            disabled={!props.pickable}
            title={props.pickable ? t("capsule.changeProfile") : undefined}
            onClick={props.onPick}
          >
            {props.profileLabel}
          </button>
          <button
            type="button"
            className="level-toggle"
            title={t("capsule.levelTitle")}
            onClick={props.onCycleLevel}
          >
            {props.level}
          </button>
          <CapsuleKey touche="⌘⏎" className="capsule-hint-key" onClick={props.onSubmit}>
            {t("capsule.reformulate")}
          </CapsuleKey>
        </div>
      ) : (
        <footer className="capsule-footer">
          <div className="capsule-verdict">
            {(props.state === "generating" || props.state === "streaming") && (
              <>
                <span className="pulse accent">{t("capsule.receiving")}</span>
                <span className="capsule-elapsed">{(props.elapsedMs / 1000).toFixed(1)} s</span>
              </>
            )}
            {props.finalResult !== null && (
              <>
                <span className={`verdict-${props.finalResult.quality.status}`}>
                  {props.verdictLabel}
                </span>
                <span className="muted">{props.verdictDetail}</span>
                <span className="capsule-meta">
                  {t("capsule.level")} {props.finalResult.level} · {props.finalResult.model}
                  {props.finalResult.latencyMs !== undefined &&
                    ` · ${(props.finalResult.latencyMs / 1000).toFixed(1)} s`}
                </span>
              </>
            )}
            {props.state === "error" && <span className="muted">{t("capsule.escToClose")}</span>}
          </div>
          <div className="capsule-keys">
            {(props.state === "ready" || props.state === "comparison") && (
              <>
                {/* Le même déclencheur que sur C0, à l'endroit où l'on agit. */}
                <button
                  type="button"
                  className="profile-chip profile-chip-pick"
                  disabled={!props.pickable}
                  title={props.pickable ? t("capsule.changeProfile") : undefined}
                  onClick={props.onPick}
                >
                  {props.profileLabel}
                </button>
                {props.expansion && (
                  <CapsuleKey touche="⇥" className="key-primary" onClick={props.onLevel}>
                    {t("capsule.lowerLevel")}
                  </CapsuleKey>
                )}
                <CapsuleKey touche="⏎" className="key-primary" onClick={props.onAccept}>
                  {t("capsule.replace")}
                </CapsuleKey>
                {/* La touche annoncée est celle qui bascule : un clic ne se
                    maintient pas, ⌥ non plus une fois la souris partie. Le
                    maintien de ⌥ reste actif, et l'infobulle le dit. */}
                <CapsuleKey
                  touche={CAPSULE_COMPARE_KEY}
                  pressed={props.comparisonPinned}
                  title={t("capsule.compareTitle")}
                  onClick={props.onCompare}
                >
                  {t("capsule.compare")}
                </CapsuleKey>
                <CapsuleKey touche="⌘C" onClick={props.onCopy}>
                  {t("capsule.copy")}
                </CapsuleKey>
                <CapsuleKey touche="⌘R" onClick={props.onRerun}>
                  {t("capsule.rerun")}
                </CapsuleKey>
                <CapsuleKey touche="⇥" title={t("capsule.levelCycleTitle")} onClick={props.onLevel}>
                  {t("capsule.level")}
                </CapsuleKey>
              </>
            )}
            {props.running && (
              <>
                <CapsuleKey touche="⌘." onClick={props.onCancel}>
                  {t("capsule.interrupt")}
                </CapsuleKey>
                {/* La capsule travaille sans le focus : le dire évite d'attendre
                  devant elle pour rien. */}
                <span className="capsule-hint">{t("capsule.switchApps")}</span>
              </>
            )}
            <CapsuleKey touche="esc" className="key-close" onClick={props.onClose}>
              {t("capsule.close")}
            </CapsuleKey>
          </div>
        </footer>
      )}
    </>
  );
}

export function App(): React.JSX.Element {
  const t = useT();
  const [state, setState] = useState<CapsuleState>("capture");
  const [input, setInput] = useState("");
  const [origin, setOrigin] = useState<string | null>(null);
  const [requestedProfile, setRequestedProfile] = useState<string | null>(null);
  const [level, setLevel] = useState<Level>("standard");
  const [streamed, setStreamed] = useState("");
  const [result, setResult] = useState<RepromptResult | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ProfileCatalogEntry[]>([]);
  /** Profil choisi à la main ; `null` laisse le défaut de la configuration. */
  const [chosenProfile, setChosenProfile] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  /**
   * Le résultat tel qu'il a été repris, ou `null` s'il n'a pas été touché.
   *
   * Deux valeurs distinctes plutôt qu'une copie initialisée depuis le
   * résultat : `null` dit « rien n'a été modifié », et c'est ce qui permet à
   * l'acceptation de ne rien porter du tout, donc au processus principal
   * d'appliquer exactement le texte qu'il a produit.
   */
  const [edited, setEdited] = useState<string | null>(null);
  /** Le curseur est dans le champ du résultat : la frappe lui appartient. */
  const [editing, setEditing] = useState(false);
  const { toast, show: annoncer, dismiss: fermerAnnonce } = useToast();
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
  /**
   * Ce qui demande la comparaison : `⌥` maintenu, `⌘D` épinglé, ou les deux.
   *
   * Un état plutôt qu'une référence : la machine est réalignée par un effet à
   * partir de cette intention, ce qui rend l'ordre des deux touches sans
   * importance — relâcher `⌥` sur une comparaison épinglée ne la referme pas,
   * et `⌘D` pendant un maintien ne laisse pas la capsule sans issue.
   */
  const [comparison, setComparison] = useState(NO_COMPARISON);
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
      // Entrer dans `analysis` ici, pas chez l'appelant.
      //
      // Trois chemins sur cinq l'oubliaient — ⌘R, ⇥ et la pastille de niveau —
      // et un run parti de `ready` y restait : `run-accepted` était refusé, donc
      // ni barre d'activité, ni texte en cours de réception, ni écran d'erreur
      // si le fournisseur refusait. Seul le résultat final finissait par
      // apparaître, sans rien entre les deux. Depuis `analysis` ou `input`,
      // l'événement est sans effet : la transition a déjà eu lieu.
      dispatch("rerun");
      setStartedAt(Date.now());
      setElapsedMs(0);
      setStreamedBoth(() => "");
      setResult(null);
      setError(null);
      setNotice(null);
      // Une nouvelle génération repart du texte du modèle : garder l'édition
      // précédente ferait copier et remplacer un texte que plus rien à l'écran
      // ne montre.
      setEdited(null);
      setEditing(false);
      window.reqraft
        .startReprompt({
          input: text,
          level: chosenLevel,
          ...(chosenProfile === null ? {} : { profileId: chosenProfile }),
        })
        .then((response) => {
          activeRunId.current = response.runId;
          // analysis → run-accepted → generating (§8.2). The event only means
          // the run started: for `auto`, the applied profile is still unknown
          // here and lands with the result.
          setRequestedProfile(response.requestedProfile);
          dispatch("run-accepted");
        })
        .catch((reason: unknown) => {
          setError({
            title: t("capsule.error"),
            message: reason instanceof Error ? reason.message : String(reason),
          });
          dispatch("failed");
        });
    },
    [chosenProfile, dispatch, setStreamedBoth, t],
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
    setEdited(null);
    setEditing(false);
    setLevel("standard");
    // Un choix fait dans une capsule ne doit pas modifier la capture suivante.
    // Sinon « auto » et le profil configuré sont contournés sans l'indiquer.
    setChosenProfile(null);
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
          dispatch("captured");
          startRun(capture.text, "standard");
        } else {
          // Une capture vide a deux causes très différentes : rien n'était
          // sélectionné, ou macOS a refusé. Seule la seconde demande une
          // action, et elle est invisible si on ne la dit pas.
          if (capture.reason !== undefined) setNotice(capture.reason);
          dispatch("nothing-to-capture");
        }
      })
      .catch(() => {
        dispatch("nothing-to-capture");
      });
  }, [dispatch, resetSession, startRun]);

  /**
   * Une ouverture n'est traitée qu'une fois, quel que soit le chemin.
   *
   * Elle arrive par deux voies parce qu'aucune n'est fiable seule : poussée
   * par le main, et demandée au montage. Sans cet identifiant, une double
   * livraison relancerait une capture dont la sélection a déjà été consommée.
   */
  const derniereOuverture = useRef<number>(0);

  const traiterOuverture = useCallback(
    (payload: CapsuleOpenedPayload) => {
      if (payload.id <= derniereOuverture.current) {
        return;
      }
      derniereOuverture.current = payload.id;
      if (payload.mode === "capture") {
        beginCapture();
      } else {
        // Volontairement pas de `resetSession()` : la fenêtre se cache dès
        // qu'on clique ailleurs, et repartir de zéro à la réouverture jette ce
        // qui venait d'être écrit. Le brouillon est effacé après un envoi.
        setNotice(null);
        setState("input");
      }
    },
    [beginCapture],
  );

  useOuvertureDeCapsule(traiterOuverture);

  useEffect(() => {
    // Des fichiers sur disque : un catalogue illisible ne doit pas empêcher la
    // capsule de fonctionner, elle se passera simplement du sélecteur.
    window.reqraft
      .profileCatalog()
      .then((catalog) => {
        setProfiles(catalog.entries);
      })
      .catch(() => {
        setProfiles([]);
      });
  }, []);

  // Run events, filtered by runId; every subscription is removed on unmount
  // (§5.6).
  useEffect(() => {
    const offDelta = window.reqraft.onRunDelta((payload) => {
      if (payload.runId === activeRunId.current) {
        if (streamedRef.current === "") {
          dispatch("first-chunk");
        }
        setStreamedBoth((previous) => previous + payload.chunk);
      }
    });
    const offDone = window.reqraft.onRunDone((payload) => {
      if (payload.runId === activeRunId.current) {
        setResult(payload.result);
        dispatch("result-complete");
      }
    });
    const offError = window.reqraft.onRunError((payload) => {
      if (payload.runId === activeRunId.current) {
        setError(payload.error);
        dispatch("failed");
      }
    });
    const offCancelled = window.reqraft.onRunCancelled((payload) => {
      if (payload.runId === activeRunId.current) {
        // §8.2: partial text lands on ready, otherwise the capsule closes.
        if (streamedRef.current === "") {
          window.close();
        } else {
          dispatch("result-complete");
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

  /**
   * Un remplacement qui n'a pas eu lieu doit se voir, et laisser la main.
   *
   * `dispatch("accept")` a déjà fait passer la capsule sur `applying`, où le
   * pied ne rend plus aucune touche : sans retour explicite vers `ready`, la
   * fenêtre restait muette et inerte, esc mis à part.
   */
  const echecDuRemplacement = useCallback(
    (reason?: string) => {
      annoncer(
        reason === undefined
          ? t("capsule.replaceFailed")
          : t("capsule.replaceFailedWhy", { reason }),
        "error",
      );
      dispatch("failed");
    },
    [annoncer, dispatch, t],
  );

  /**
   * Le texte à appliquer, ou `undefined` s'il n'a pas été repris.
   *
   * Un résultat vidé n'est pas une reformulation : le laisser partir
   * remplacerait la sélection par rien. Le contrat le refuse déjà côté
   * principal ; le dire ici évite un aller-retour dont le seul résultat serait
   * un échec.
   */
  const texteAAppliquer = useCallback((): { ok: true; text?: string } | { ok: false } => {
    if (edited === null) return { ok: true };
    if (edited.trim() === "") {
      annoncer(t("capsule.editEmpty"), "warning");
      return { ok: false };
    }
    return { ok: true, text: edited };
  }, [annoncer, edited, t]);

  const accept = useCallback(() => {
    const runId = activeRunId.current;
    if (runId === null) {
      return;
    }
    const texte = texteAAppliquer();
    if (!texte.ok) {
      return;
    }
    dispatch("accept");
    window.reqraft
      .acceptResult(runId, "replace", texte.text)
      .then(async ({ applied, reason }) => {
        if (applied) {
          dispatch("applied");
          window.close();
          return;
        }
        // Floor mode (permissions, Wayland, unknown source app): copy instead
        // of replacing, and say so (§2.6, §5.4). The reason comes from the
        // main process when it has one — « indisponible » alone leaves the
        // user with nothing to act on.
        const copy = await window.reqraft.acceptResult(runId, "copy", texte.text);
        if (!copy.applied) {
          // Ni remplacé, ni copié : le résultat est perdu de vue si on ne le
          // dit pas, et la capsule resterait figée sur `applying`.
          echecDuRemplacement(reason);
          return;
        }
        const message =
          reason === undefined
            ? t("capsule.replaceUnavailable")
            : t("capsule.replaceUnavailableWhy", { reason });
        annoncer(message, "warning");
        dispatch("applied");
        window.setTimeout(() => {
          window.close();
        }, toastDurationMs(message));
      })
      .catch((cause: unknown) => {
        echecDuRemplacement(cause instanceof Error ? cause.message : undefined);
      });
  }, [annoncer, dispatch, echecDuRemplacement, t, texteAAppliquer]);

  const cancelRun = useCallback(() => {
    const runId = activeRunId.current;
    if (runId !== null) {
      void window.reqraft.cancelReprompt(runId);
    }
  }, []);

  /**
   * Relance en imposant un profil.
   *
   * `startRun` lit `chosenProfile` dans l'état, qui n'est pas encore à jour
   * quand on vient de cliquer : le profil arriverait avec un run de retard.
   */
  const startRunAvecProfil = useCallback(
    (text: string, chosenLevel: Level, profileId: string) => {
      setStartedAt(Date.now());
      setElapsedMs(0);
      setStreamedBoth(() => "");
      setResult(null);
      setError(null);
      setNotice(null);
      setEdited(null);
      setEditing(false);
      dispatch("rerun");
      window.reqraft
        .startReprompt({ input: text, level: chosenLevel, profileId })
        .then((response) => {
          activeRunId.current = response.runId;
          setRequestedProfile(response.requestedProfile);
          dispatch("run-accepted");
        })
        .catch((reason: unknown) => {
          setError({
            title: t("capsule.error"),
            message: reason instanceof Error ? reason.message : String(reason),
          });
          dispatch("failed");
        });
    },
    [dispatch, setStreamedBoth, t],
  );

  const copier = useCallback(() => {
    const runId = activeRunId.current;
    if (runId === null) {
      return;
    }
    const texte = texteAAppliquer();
    if (!texte.ok) {
      return;
    }
    void window.reqraft
      .acceptResult(runId, "copy", texte.text)
      .then(({ applied }) => {
        annoncer(
          applied ? t("capsule.copied") : t("clipboard.copyFailed"),
          applied ? "success" : "error",
        );
      })
      .catch(() => {
        annoncer(t("clipboard.copyFailed"), "error");
      });
  }, [annoncer, t, texteAAppliquer]);

  const promptEstVide = input.trim() === "";

  const relancer = useCallback(() => {
    if (promptEstVide) {
      annoncer(t(PROMPT_EMPTY_MESSAGE), "warning");
      return;
    }
    startRun(input, level);
  }, [annoncer, input, level, promptEstVide, startRun, t]);

  /** ⇥ monte d'un niveau, ⇧⇥ redescend ; le clic n'a pas de modificateur. */
  const changerNiveau = useCallback(
    (direction: 1 | -1) => {
      if (promptEstVide) {
        annoncer(t(PROMPT_EMPTY_MESSAGE), "warning");
        return;
      }
      const next = cycleRepromptLevel(level, direction);
      setLevel(next);
      startRun(input, next);
    },
    [annoncer, input, level, promptEstVide, startRun, t],
  );

  const fermer = useCallback(() => {
    cancelRun();
    setState("closed");
    window.close();
  }, [cancelRun]);

  /** Le clic fait ce que ⌘D fait : épingler. Un clic ne se maintient pas. */
  const basculerComparaison = useCallback(() => {
    setComparison((current) => reduceComparison(current, "pin-comparison"));
  }, []);

  /**
   * L'édition ne retient les touches que là où le champ existe.
   *
   * Un champ démonté n'émet pas toujours son `blur` : `editing` pourrait
   * rester vrai après une relance, et la capsule serait sourde à ⏎, ⌘C et ⌘R
   * sans que rien à l'écran ne l'explique. Croiser avec l'état rend cette
   * survivance sans effet.
   */
  const contexteClavier = useMemo(
    () => ({ state, editing: editing && state === "ready" }),
    [state, editing],
  );

  // Keyboard: ⏎ remplacer, ⌥ comparer (maintenu), ⌘D comparer (épinglé),
  // ⌘C copier, ⌘R relancer, ⇥/⇧⇥ niveau, esc fermer, ⌘. interrompre.
  //
  // Quelle frappe fait quoi est décidé dans `keyboard.ts`, hors du DOM : c'est
  // la seule forme sous laquelle la règle est testable ici, la suite tournant
  // sans environnement DOM.
  useEffect(() => {
    const executer: Record<CapsuleIntent, () => void> = {
      close: fermer,
      cancel: cancelRun,
      accept,
      copy: copier,
      rerun: relancer,
      "level-next": () => {
        changerNiveau(1);
      },
      "level-previous": () => {
        changerNiveau(-1);
      },
      // Les trois commandes de comparaison ne dispatchent rien elles-mêmes :
      // elles ne font qu'écrire l'intention, qu'un effet aligne sur la machine.
      "hold-comparison": () => {
        setComparison((current) => reduceComparison(current, "hold-comparison"));
      },
      "release-comparison": () => {
        setComparison((current) => reduceComparison(current, "release-comparison"));
      },
      "pin-comparison": basculerComparaison,
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Couper le navigateur d'abord, et sur la frappe : une répétition de ⌘D
      // n'a plus de commande à exécuter mais reste une frappe de la capsule.
      if (preventsBrowserDefault(event, contexteClavier)) event.preventDefault();
      const intent = resolveCapsuleKeyDown(event, contexteClavier);
      if (intent !== null) executer[intent]();
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      const intent = resolveCapsuleKeyUp(event);
      if (intent !== null) executer[intent]();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    contexteClavier,
    accept,
    basculerComparaison,
    cancelRun,
    changerNiveau,
    copier,
    fermer,
    relancer,
  ]);

  /**
   * La machine suit l'intention de comparaison, et l'intention suit la machine.
   *
   * Le second sens est celui qui manquait à `⌘D` : une comparaison épinglée
   * n'est vraie que tant que l'« avant » affiché est l'entrée du résultat
   * montré. Une nouvelle capture, une nouvelle génération, une fermeture ou un
   * remplacement appliqué font sortir de ces états — et l'épinglage part avec,
   * au lieu de rouvrir la comparaison sur le run suivant.
   */
  useEffect(() => {
    if (!keepsComparison(state)) {
      setComparison(NO_COMPARISON);
      return;
    }
    const event = comparisonEvent(state, wantsComparison(comparison));
    if (event !== null) dispatch(event);
  }, [state, comparison, dispatch]);

  // Choisir un profil a un sens avant de lancer, et devant un résultat qu'on
  // peut relancer autrement. Pendant le travail, non.
  const profilChoisissable =
    profiles.length > 0 && (state === "input" || state === "ready" || state === "comparison");

  const running = state === GENERATING || state === "streaming" || state === "analysis";

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
    (state === "ready" || state === "comparison" || state === "applying") && result !== null;
  const finalResult = showResult ? result : null;
  /**
   * Le texte qui fait foi : celui affiché, repris ou non.
   *
   * Une seule valeur pour l'affichage, la copie, le remplacement et le « + »
   * de la comparaison. Deux sources — le résultat du modèle d'un côté,
   * l'édition de l'autre — feraient tôt ou tard copier autre chose que ce que
   * la comparaison montre.
   */
  const finalText = edited ?? result?.rewritten ?? "";
  const promptEditable = state === "ready" || state === "applying";
  const promptVisibleOutsideComparison = state !== "input" && state !== "comparison";
  const promptVisible = promptVisibleOutsideComparison && (input !== "" || promptEditable);

  const finding = describeQualityFinding(finalResult?.quality.signals ?? [], t);

  function computeVerdictLabel(): string {
    if (finalResult === null) {
      return "";
    }
    if (finding !== null) {
      return finding.label;
    }
    if (expansion === true) {
      return t("capsule.expansionDetected");
    }
    return t(QUALITY_KEYS[finalResult.quality.status]);
  }
  const verdictLabel = computeVerdictLabel();

  function computeVerdictDetail(): string {
    if (finding !== null) return finding.detail;
    return expansion === true ? t("capsule.expansionDetail") : t("capsule.noInvention");
  }
  const verdictDetail = computeVerdictDetail();

  // `result.profile` is the profile actually applied and outranks anything
  // known at start. Until it arrives, an explicit request is already its own
  // answer, while `auto` has none to show yet.
  const autoRequested = requestedProfile === AUTO_PROFILE_ID;
  const appliedProfile = result?.profile ?? null;
  const displayedProfile = appliedProfile ?? (autoRequested ? null : requestedProfile);
  // Ce qui s'applique, pas ce qui a été demandé : afficher « auto » pendant
  // que l'en-tête annonce « clean » donnerait deux vérités côte à côte.
  const profilAffiche = chosenProfile ?? displayedProfile ?? AUTO_PROFILE_ID;
  const awaitingDetection = autoRequested && appliedProfile === null;

  const choisirProfil = useCallback(
    (id: string) => {
      setChosenProfile(id);
      setPicking(false);
      // Depuis un résultat, le choix se voit tout de suite : le relancer est
      // ce que « changer de profil » veut dire à ce moment-là.
      if (state !== "ready" && state !== "comparison") return;
      if (promptEstVide) {
        annoncer(t(PROMPT_EMPTY_MESSAGE), "warning");
        return;
      }
      startRunAvecProfil(input, level, id);
    },
    [annoncer, input, level, promptEstVide, startRunAvecProfil, state, t],
  );

  return (
    <main className="capsule">
      <CapsuleHeader
        origin={origin}
        displayedProfile={displayedProfile}
        autoRequested={autoRequested}
        detecting={running && awaitingDetection}
        closable={state === "input"}
        onClose={fermer}
      />
      {(running || state === "capture") && <div className="capsule-bar" aria-hidden="true" />}

      {picking ? (
        <ProfileSheet
          entries={profiles}
          selectedId={chosenProfile ?? displayedProfile ?? AUTO_PROFILE_ID}
          onSelect={choisirProfil}
          onClose={() => {
            setPicking(false);
          }}
          onManage={() => void window.reqraft.openSettings()}
        />
      ) : (
        <section className={state === "input" ? "capsule-body capsule-flush" : "capsule-body"}>
          {state === "input" && (
            <>
              <textarea
                className="capsule-input"
                placeholder={t("capsule.placeholder")}
                value={input}
                rows={4}
                autoFocus
                onChange={(event) => {
                  setInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.metaKey && input.trim() !== "") {
                    dispatch("submitted");
                    startRun(input, level);
                  }
                }}
              />
            </>
          )}

          {promptVisible && (
            <CapsuleSource
              input={input}
              label={t("capsule.before")}
              editLabel={t("capsule.editPromptLabel")}
              editable={promptEditable}
              readOnly={state === "applying"}
              onChange={setInput}
              onEditingChange={setEditing}
            />
          )}

          {state === "capture" && <p className="muted">{t("capsule.readingSelection")}</p>}

          {state === "analysis" && <p className="muted">{t("capsule.analysingIntent")}</p>}

          {state === GENERATING && (
            <p className="muted">
              {displayedProfile !== null
                ? t("capsule.detectedPreparing", { profile: displayedProfile })
                : t("capsule.preparing")}
            </p>
          )}

          {state === "streaming" && (
            <pre className="capsule-stream">
              {streamed}
              <span className="caret" aria-hidden="true" />
            </pre>
          )}

          {(state === "ready" || state === "applying") && result !== null && (
            <ResultEditor
              value={finalText}
              label={t("capsule.editLabel")}
              // Une fois l'acceptation partie, le texte est celui qui part.
              readOnly={state === "applying"}
              onChange={setEdited}
              onEditingChange={setEditing}
            />
          )}

          {state === "comparison" && result !== null && (
            <div className="capsule-diff">
              <div className="diff-before">− {input}</div>
              <div className="diff-after">+ {finalText}</div>
            </div>
          )}

          {state === "error" && error !== null && (
            <div role="alert">
              <div className="error-title">× {error.title}</div>
              <p className="error-detail">{error.message}</p>
              {error.nextAction !== undefined && <p className="muted">{error.nextAction}</p>}
            </div>
          )}

          {notice !== null && <p className="capsule-notice">{notice}</p>}
        </section>
      )}

      <CapsuleFooter
        state={state}
        expansion={expansion === true}
        comparisonPinned={comparison.pinned}
        running={running}
        elapsedMs={elapsedMs}
        finalResult={finalResult}
        verdictLabel={verdictLabel}
        verdictDetail={verdictDetail}
        profileLabel={profilAffiche}
        pickable={profilChoisissable}
        onPick={() => {
          setPicking(true);
        }}
        onCycleLevel={() => {
          setLevel(cycleRepromptLevel(level, 1));
        }}
        level={level}
        onSubmit={() => {
          if (input.trim() === "") return;
          dispatch("submitted");
          startRun(input, level);
        }}
        onAccept={accept}
        onCompare={basculerComparaison}
        onCopy={copier}
        onRerun={relancer}
        onLevel={() => {
          changerNiveau(1);
        }}
        onCancel={cancelRun}
        onClose={fermer}
      />

      {/* Hors du corps : le message ne défile pas avec le résultat et ne
          déplace rien, et il se pose au-dessus du pied sans le recouvrir. */}
      <Toast toast={toast} onDismiss={fermerAnnonce} />
    </main>
  );
}
