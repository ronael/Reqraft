import { useCallback, useEffect, useState } from "react";
import { useT, type Translate } from "../shared/i18n.js";
import {
  Check,
  Circle,
  CircleDot,
  CopyPlus,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  REPROMPT_LEVEL_IDS,
  type ProfileCatalogEntry,
  type ProfileCatalogResponse,
  type ProfileDetail,
  type ProfileSaveRequest,
  type SafeConfig,
} from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Settings → Profils.
 *
 * Every read and every write goes through the IPC bridge: this file never
 * touches a file, a path or a schema. What it validates below is only there to
 * show a problem before a round trip — the main process validates for real,
 * against `src/profiles/`, and its refusal is what actually protects the store.
 */

/** Built-in ids a local profile may inherit from, mirrored from the catalogue. */
function builtinIds(entries: readonly ProfileCatalogEntry[]): string[] {
  return entries.filter((entry) => entry.origin === "builtin").map((entry) => entry.id);
}

/**
 * A usable id derived from a display name.
 *
 * Only a suggestion, and only for the field's convenience: the id the user
 * ends up with is validated by the main process. Accents are stripped before
 * the charset filter, so "Rédaction web" gives "redaction-web".
 */
export function suggestId(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== "")
    .join("-")
    .slice(0, 64)
    .replace(/-$/, "");
}

interface FormState {
  mode: "create" | "update" | "duplicate";
  /** The profile being edited, or the one a duplicate was taken from. */
  sourceId?: string;
  id: string;
  name: string;
  description: string;
  extends: string;
  defaultLevel: (typeof REPROMPT_LEVEL_IDS)[number];
  instructions: string;
}

const EMPTY_FORM: FormState = {
  mode: "create",
  id: "",
  name: "",
  description: "",
  extends: "",
  defaultLevel: "standard",
  instructions: "",
};

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The first thing wrong with the form, or `undefined`.
 *
 * One message at a time, in field order, so the user is not handed a list to
 * map back onto rows.
 */
export function findFormProblem(
  form: FormState,
  taken: readonly string[],
  t: Translate = (key) => key,
): string | undefined {
  if (form.name.trim() === "") return t("profiles.nameRequired");
  if (form.id.trim() === "") return t("profiles.idRequired");
  if (!ID_PATTERN.test(form.id.trim())) {
    return t("profiles.idInvalid");
  }
  // An edit keeps its own id, so it is not a collision with itself.
  if (form.mode !== "update" && taken.includes(form.id.trim())) {
    return t("profiles.idTaken", { id: form.id.trim() });
  }
  if (form.mode === "duplicate") return undefined;
  if (form.description.trim() === "") return t("profiles.descriptionRequired");
  if (form.instructions.trim() === "") return t("profiles.instructionsRequired");
  return undefined;
}

export interface ProfilesTabProps {
  config: SafeConfig;
  onSelectDefault(id: string): void;
}

export function ProfilesTab({
  config,
  onSelectDefault,
}: Readonly<ProfilesTabProps>): React.JSX.Element {
  const t = useT();
  const [catalog, setCatalog] = useState<ProfileCatalogResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void window.reqraft
      .profileCatalog()
      .then(setCatalog)
      .catch((cause: unknown) => {
        setError(describe(cause));
      });
  }, []);

  useEffect(refresh, [refresh]);

  /** Runs a mutation, keeping its failure on screen instead of crashing. */
  const run = useCallback(
    async (operation: () => Promise<{ catalog: ProfileCatalogResponse }>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const { catalog: next } = await operation();
        setCatalog(next);
        return true;
      } catch (cause) {
        setError(describe(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const entries = catalog?.entries ?? [];
  const locals = entries.filter((entry) => entry.origin === "local");
  const takenIds = entries.map((entry) => entry.id);

  const openEdit = useCallback((id: string) => {
    setError(null);
    setProblem(undefined);
    void window.reqraft
      .readProfile(id)
      .then((detail: ProfileDetail) => {
        setForm({
          mode: "update",
          sourceId: detail.id,
          id: detail.id,
          name: detail.name,
          description: detail.description,
          extends: detail.extends ?? "",
          defaultLevel: detail.defaultLevel,
          instructions: detail.instructions,
        });
      })
      .catch((cause: unknown) => {
        setError(describe(cause));
      });
  }, []);

  const submit = useCallback(async () => {
    if (form === null) return;
    const found = findFormProblem(form, takenIds, t);
    if (found !== undefined) {
      setProblem(found);
      return;
    }
    setProblem(undefined);

    const ok = await run(() =>
      form.mode === "duplicate"
        ? window.reqraft.duplicateProfile({
            sourceId: form.sourceId ?? "",
            targetId: form.id.trim(),
            name: form.name.trim(),
          })
        : window.reqraft.saveProfile({
            mode: form.mode === "update" ? "update" : "create",
            profile: {
              id: form.id.trim(),
              name: form.name.trim(),
              description: form.description.trim(),
              ...(form.extends === ""
                ? {}
                : {
                    extends: form.extends as NonNullable<ProfileSaveRequest["profile"]["extends"]>,
                  }),
              defaultLevel: form.defaultLevel,
              instructions: form.instructions.trim(),
            },
          }),
    );
    if (ok) setForm(null);
  }, [form, run, t, takenIds]);

  if (form !== null) {
    return (
      <ProfileForm
        form={form}
        bases={builtinIds(entries)}
        problem={problem}
        error={error}
        busy={busy}
        onChange={setForm}
        onCancel={() => {
          setForm(null);
          setProblem(undefined);
          setError(null);
        }}
        onSubmit={() => {
          void submit();
        }}
      />
    );
  }

  return (
    <>
      {error !== null && <p className="settings-warning">{error}</p>}
      {catalog?.problems.map((entry) => (
        // Un profil masqué par le projet fonctionne : il n'est pas un
        // avertissement, seulement une note. Les peindre pareil apprendrait à
        // ignorer les deux.
        <p
          key={entry.path}
          className={entry.kind === "shadowed" ? "settings-note muted" : "settings-warning"}
        >
          {entry.detail}
        </p>
      ))}

      <div className="profile-toolbar">
        <p className="profile-intro">{t("profiles.intro")}</p>
        <button
          type="button"
          className="button-primary profile-new"
          onClick={() => {
            setError(null);
            setForm({ ...EMPTY_FORM });
          }}
        >
          <Plus size={15} aria-hidden />
          {t("profiles.new")}
        </button>
      </div>

      {locals.length === 0 && <p className="settings-note muted">{t("profiles.empty")}</p>}

      <div className="profile-list">
        {entries.map((entry) => (
          <ProfileRow
            key={entry.id}
            entry={entry}
            busy={busy}
            confirming={pendingDelete === entry.id}
            isDefault={entry.id === config.defaultProfile}
            onCancelDelete={() => {
              setPendingDelete(null);
            }}
            onConfirmDelete={() => {
              void run(() => window.reqraft.deleteProfile(entry.id)).then((ok) => {
                if (ok) setPendingDelete(null);
              });
            }}
            onDuplicate={() => {
              setError(null);
              setForm({
                ...EMPTY_FORM,
                mode: "duplicate",
                sourceId: entry.id,
                name: entry.name,
                description: "",
                defaultLevel: entry.defaultLevel ?? "standard",
                // The id is left empty: a duplicate opening on a taken
                // id would only ever fail on save.
                instructions: "",
              });
            }}
            onEdit={() => {
              openEdit(entry.id);
            }}
            onExport={() => {
              setError(null);
              void window.reqraft.exportProfile(entry.id).catch((cause: unknown) => {
                setError(describe(cause));
              });
            }}
            onSelectDefault={() => {
              onSelectDefault(entry.id);
            }}
            onStartDelete={() => {
              setPendingDelete(entry.id);
            }}
          />
        ))}
      </div>
    </>
  );
}

interface ProfileRowProps {
  entry: ProfileCatalogEntry;
  busy: boolean;
  confirming: boolean;
  isDefault: boolean;
  onCancelDelete(): void;
  onConfirmDelete(): void;
  onDuplicate(): void;
  onEdit(): void;
  onExport(): void;
  onSelectDefault(): void;
  onStartDelete(): void;
}

function ProfileRow({
  entry,
  busy,
  confirming,
  isDefault,
  onCancelDelete,
  onConfirmDelete,
  onDuplicate,
  onEdit,
  onExport,
  onSelectDefault,
  onStartDelete,
}: Readonly<ProfileRowProps>): React.JSX.Element {
  const t = useT();
  const isLocal = entry.origin === "local";
  const isAuto = entry.origin === "auto";

  return (
    <div className={isDefault ? "profile-row profile-row-active" : "profile-row"}>
      <div className="profile-identity">
        <div className="settings-row-title">
          {entry.name}
          <span className="profile-origin">{profileOriginLabel(entry.origin, t)}</span>
        </div>
        <div className="settings-row-detail profile-description">{entry.description}</div>
        {entry.defaultLevel !== undefined && (
          <div className="settings-row-detail profile-meta">
            {t("profiles.levelMeta", { level: entry.defaultLevel })}
          </div>
        )}
        {confirming && (
          <div className="settings-row-detail profile-confirm">
            {t("profiles.confirmDeleteQuestion", { id: entry.id })}
          </div>
        )}
      </div>

      <div className="profile-actions">
        {confirming ? (
          <DeleteConfirmationActions
            busy={busy}
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
          />
        ) : (
          <ProfileRowActions
            isAuto={isAuto}
            isDefault={isDefault}
            isLocal={isLocal}
            onDuplicate={onDuplicate}
            onEdit={onEdit}
            onExport={onExport}
            onSelectDefault={onSelectDefault}
            onStartDelete={onStartDelete}
          />
        )}
      </div>
    </div>
  );
}

function profileOriginLabel(
  origin: ProfileCatalogEntry["origin"],
  t: Translate = (key) => key,
): string {
  // `Auto` et `Local` sont les mêmes mots dans les deux langues ; seul
  // « Intégré » change.
  if (origin === "auto") return "Auto";
  if (origin === "local") return "Local";
  return t("profiles.builtin");
}

interface DeleteConfirmationActionsProps {
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}

function DeleteConfirmationActions({
  busy,
  onCancel,
  onConfirm,
}: Readonly<DeleteConfirmationActionsProps>): React.JSX.Element {
  const t = useT();
  return (
    <>
      <IconButton
        label={t("profiles.confirmDelete")}
        tone="danger"
        disabled={busy}
        onClick={onConfirm}
      >
        <Check size={15} aria-hidden />
      </IconButton>
      <IconButton label={t("settings.cancel")} onClick={onCancel}>
        <X size={15} aria-hidden />
      </IconButton>
    </>
  );
}

interface ProfileRowActionsProps {
  isAuto: boolean;
  isDefault: boolean;
  isLocal: boolean;
  onDuplicate(): void;
  onEdit(): void;
  onExport(): void;
  onSelectDefault(): void;
  onStartDelete(): void;
}

function ProfileRowActions({
  isAuto,
  isDefault,
  isLocal,
  onDuplicate,
  onEdit,
  onExport,
  onSelectDefault,
  onStartDelete,
}: Readonly<ProfileRowActionsProps>): React.JSX.Element {
  const t = useT();
  return (
    <>
      <IconButton
        label={isDefault ? t("profiles.tooltipInUse") : t("profiles.use")}
        active={isDefault}
        // Not disabled: a radio you cannot press reads as broken, and
        // re-selecting the current one is harmless.
        onClick={onSelectDefault}
      >
        {isDefault ? <CircleDot size={15} aria-hidden /> : <Circle size={15} aria-hidden />}
      </IconButton>
      <IconButton
        label={isLocal ? t("settings.edit") : t("profiles.builtinNotEditable")}
        disabled={!isLocal}
        onClick={onEdit}
      >
        <Pencil size={15} aria-hidden />
      </IconButton>
      <IconButton
        label={isAuto ? t("profiles.tooltipAutoNoDuplicate") : t("profiles.duplicate")}
        disabled={isAuto}
        onClick={onDuplicate}
      >
        <CopyPlus size={15} aria-hidden />
      </IconButton>
      <IconButton
        label={isAuto ? t("profiles.tooltipAutoNoExport") : t("profiles.export")}
        disabled={isAuto}
        onClick={onExport}
      >
        <Download size={15} aria-hidden />
      </IconButton>
      <IconButton
        label={isLocal ? t("settings.delete") : t("profiles.builtinNotDeletable")}
        tone="danger"
        disabled={!isLocal}
        onClick={onStartDelete}
      >
        <Trash2 size={15} aria-hidden />
      </IconButton>
    </>
  );
}

interface ProfileFormProps {
  form: FormState;
  bases: readonly string[];
  problem: string | undefined;
  error: string | null;
  busy: boolean;
  onChange(next: FormState): void;
  onCancel(): void;
  onSubmit(): void;
}

function ProfileForm({
  form,
  bases,
  problem,
  error,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: Readonly<ProfileFormProps>): React.JSX.Element {
  const t = useT();
  const setField = (patch: Partial<FormState>): void => {
    onChange({ ...form, ...patch });
  };
  const duplicate = form.mode === "duplicate";

  return (
    <>
      <div className="settings-row">
        <div className="settings-row-title">
          {form.mode === "update" && `Modifier « ${form.sourceId ?? ""} »`}
          {form.mode === "duplicate" && `Dupliquer « ${form.sourceId ?? ""} »`}
          {form.mode === "create" && "Nouveau profil local"}
        </div>
      </div>

      {duplicate && <p className="settings-note muted">{t("profiles.duplicateNote")}</p>}

      {problem !== undefined && <p className="settings-warning">{problem}</p>}
      {error !== null && <p className="settings-warning">{error}</p>}

      <label className="settings-row">
        <span className="settings-row-title">{t("profiles.name")}</span>
        <input
          className="settings-input"
          value={form.name}
          onChange={(event) => {
            const name = event.target.value;
            // The id follows the name until the user types one of their own.
            const follows = form.mode !== "update" && form.id === suggestId(form.name);
            setField(follows ? { name, id: suggestId(name) } : { name });
          }}
        />
      </label>

      <label className="settings-row">
        <span className="settings-row-title">
          Identifiant
          {form.mode === "update" && (
            <span className="profile-origin">{t("profiles.notEditableTag")}</span>
          )}
        </span>
        <input
          className="settings-input"
          value={form.id}
          disabled={form.mode === "update"}
          onChange={(event) => {
            setField({ id: event.target.value });
          }}
        />
      </label>

      {!duplicate && (
        <>
          <label className="settings-row">
            <span className="settings-row-title">{t("profiles.description")}</span>
            <input
              className="settings-input"
              value={form.description}
              onChange={(event) => {
                setField({ description: event.target.value });
              }}
            />
          </label>

          <label className="settings-row">
            <span className="settings-row-title">{t("profiles.base")}</span>
            <select
              className="settings-select"
              value={form.extends}
              onChange={(event) => {
                setField({ extends: event.target.value });
              }}
            >
              <option value="">{t("profiles.noneLevel")}</option>
              {bases.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-row">
            <span className="settings-row-title">{t("profiles.defaultLevel")}</span>
            <select
              className="settings-select"
              value={form.defaultLevel}
              onChange={(event) => {
                setField({ defaultLevel: event.target.value as FormState["defaultLevel"] });
              }}
            >
              {REPROMPT_LEVEL_IDS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <div className="settings-row profile-instructions">
            <span className="settings-row-title">{t("profiles.instructions")}</span>
            <textarea
              className="settings-input profile-textarea"
              rows={6}
              value={form.instructions}
              onChange={(event) => {
                setField({ instructions: event.target.value });
              }}
            />
          </div>
        </>
      )}

      <div className="settings-actions profile-form-actions">
        <button type="button" onClick={onCancel}>
          {t("settings.cancel")}
        </button>
        <button type="button" className="button-primary" disabled={busy} onClick={onSubmit}>
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
    </>
  );
}

/**
 * An IPC rejection as a sentence.
 *
 * Electron prefixes a handler's error with "Error invoking remote method …";
 * that prefix names the plumbing, not the problem, so it is trimmed away.
 */
function describe(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  const separator = message.indexOf("Error: ");
  return separator === -1 ? message : message.slice(separator + "Error: ".length);
}

interface IconButtonProps {
  /** Read by screen readers and shown as the native tooltip. */
  label: string;
  tone?: "neutral" | "danger";
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}

/**
 * A square action button carrying an icon.
 *
 * The label is never dropped, only moved: five labelled buttons per row left
 * the description wrapping in a 170px column, so the wording moves to
 * `aria-label` and `title` — visible on hover, and the only thing a screen
 * reader ever had.
 */
function IconButton({
  label,
  tone = "neutral",
  active = false,
  disabled = false,
  onClick,
  children,
}: Readonly<IconButtonProps>): React.JSX.Element {
  const classes = ["icon-button"];
  if (tone === "danger") classes.push("icon-button-danger");
  if (active) classes.push("icon-button-active");

  return (
    <button
      type="button"
      className={classes.join(" ")}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
