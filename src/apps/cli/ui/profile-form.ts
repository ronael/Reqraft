import { REPROMPT_LEVELS, type RepromptLevel } from "@/core/levels.js";
import { isBuiltinProfileAlias } from "@/profiles/builtins.js";
import {
  CUSTOM_PROFILE_ID_MAX_LENGTH,
  CUSTOM_PROFILE_SCHEMA_VERSION,
  isValidCustomProfileId,
  type CustomProfile,
} from "@/profiles/custom.js";
import { BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";

/**
 * The local-profile form, as data.
 *
 * Field order, navigation, the choice cycling and the validation live here, so
 * every rule can be tested without rendering a terminal — the same split the
 * rest of `ui/` follows. The component decides what a focused field looks like;
 * it never decides what a valid profile is.
 */

export type ProfileFormMode = "create" | "edit" | "duplicate";

export type ProfileFormFieldId =
  "name" | "id" | "description" | "extends" | "defaultLevel" | "instructions";

/**
 * How a field is edited. `text` and `multiline` take typing; `choice` cycles
 * through a fixed list, so it needs no free-text validation at all.
 */
export type ProfileFormFieldKind = "text" | "multiline" | "choice";

export interface ProfileFormField {
  id: ProfileFormFieldId;
  kind: ProfileFormFieldKind;
  /** Values a `choice` field cycles through. Empty means "no base". */
  choices?: readonly string[];
}

export const PROFILE_FORM_FIELDS: readonly ProfileFormField[] = [
  { id: "name", kind: "text" },
  { id: "id", kind: "text" },
  { id: "description", kind: "text" },
  { id: "extends", kind: "choice", choices: ["", ...BUILTIN_PROFILE_IDS] },
  { id: "defaultLevel", kind: "choice", choices: REPROMPT_LEVELS },
  { id: "instructions", kind: "multiline" },
];

export type ProfileFormValues = Record<ProfileFormFieldId, string>;

export interface ProfileFormState {
  mode: ProfileFormMode;
  /** The profile being edited, or the one a duplicate was taken from. */
  sourceId?: string;
  values: ProfileFormValues;
  /** Index into `PROFILE_FORM_FIELDS`. */
  field: number;
  /** Set once a save was refused, cleared by the next edit. */
  error?: string;
  /** True while the save is in flight, so the form cannot be submitted twice. */
  saving: boolean;
}

const EMPTY_VALUES: ProfileFormValues = {
  name: "",
  id: "",
  description: "",
  extends: "",
  defaultLevel: "standard",
  instructions: "",
};

/**
 * A usable profile id derived from a display name.
 *
 * Only a suggestion — the id field stays editable. Accents are stripped before
 * the charset filter, so "Rédaction web" gives "redaction-web" and not
 * "rdaction-web".
 */
export function suggestProfileIdFromName(name: string): string {
  // Splitting on runs of rejected characters is what keeps this linear: a
  // trim-the-dashes regex backtracks, and this input comes straight from a
  // keystroke on every character typed.
  const slug = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part !== "")
    .join("-")
    .slice(0, CUSTOM_PROFILE_ID_MAX_LENGTH);
  // The join never produces a doubled dash, so the cut leaves at most one.
  const suggestion = slug.endsWith("-") ? slug.slice(0, -1) : slug;
  return isValidCustomProfileId(suggestion) && !isBuiltinProfileAlias(suggestion) ? suggestion : "";
}

export function createProfileForm(): ProfileFormState {
  return { mode: "create", values: { ...EMPTY_VALUES }, field: 0, saving: false };
}

/** Loads an existing profile for editing. The id is fixed and not re-asked. */
export function editProfileForm(profile: CustomProfile): ProfileFormState {
  return {
    mode: "edit",
    sourceId: profile.id,
    values: {
      name: profile.name,
      id: profile.id,
      description: profile.description,
      extends: profile.extends ?? "",
      defaultLevel: profile.defaultLevel,
      instructions: profile.instructions,
    },
    field: 0,
    saving: false,
  };
}

/**
 * Loads a profile as the starting point for a copy.
 *
 * The id is blanked rather than pre-filled with the source's: a duplicate that
 * opens on a taken id would only ever fail on save, and pre-filling
 * `<id>-copy` invites keeping a name nobody chose.
 */
export function duplicateProfileForm(profile: CustomProfile): ProfileFormState {
  return {
    mode: "duplicate",
    sourceId: profile.id,
    values: {
      name: profile.name,
      id: "",
      description: profile.description,
      extends: profile.extends ?? "",
      defaultLevel: profile.defaultLevel,
      instructions: profile.instructions,
    },
    field: 0,
    saving: false,
  };
}

/** Whether the id field can be typed into. An edit never renames a file. */
export function isIdEditable(state: ProfileFormState): boolean {
  return state.mode !== "edit";
}

/** The first field, which the list is never without. */
const FIRST_FIELD: ProfileFormField = { id: "name", kind: "text" };

export function currentField(state: ProfileFormState): ProfileFormField {
  return PROFILE_FORM_FIELDS[state.field] ?? FIRST_FIELD;
}

export function moveField(state: ProfileFormState, delta: 1 | -1): ProfileFormState {
  const count = PROFILE_FORM_FIELDS.length;
  return { ...state, field: (state.field + delta + count) % count };
}

/**
 * Writes a value, clearing any previous refusal.
 *
 * Typing a name also refreshes the suggested id, but only while that id is
 * still the suggestion — once the id has been typed into, it is the user's and
 * is left alone.
 */
export function setFieldValue(
  state: ProfileFormState,
  id: ProfileFormFieldId,
  value: string,
): ProfileFormState {
  const values: ProfileFormValues = { ...state.values, [id]: value };

  if (id === "name" && isIdEditable(state)) {
    const previousSuggestion = suggestProfileIdFromName(state.values.name);
    if (state.values.id === "" || state.values.id === previousSuggestion) {
      values.id = suggestProfileIdFromName(value);
    }
  }

  return { ...state, values, error: undefined };
}

/** Cycles a `choice` field. Text fields are returned untouched. */
export function cycleChoice(state: ProfileFormState, delta: 1 | -1): ProfileFormState {
  const field = currentField(state);
  if (field.kind !== "choice" || !field.choices || field.choices.length === 0) return state;

  const choices = field.choices;
  const index = choices.indexOf(state.values[field.id]);
  const next = choices[(Math.max(index, 0) + delta + choices.length) % choices.length] ?? "";
  return setFieldValue(state, field.id, next);
}

export interface ProfileFormProblem {
  field: ProfileFormFieldId;
  /** Message key, resolved by the caller so this module stays locale-free. */
  key: "required" | "idInvalid" | "levelInvalid";
}

/**
 * The first thing wrong with the form, or `undefined`.
 *
 * One problem at a time, in field order: the form shows a single message next
 * to a single field rather than a list the user has to map back onto rows.
 */
export function findProfileFormProblem(state: ProfileFormState): ProfileFormProblem | undefined {
  const { name, id, description, defaultLevel, instructions } = state.values;

  if (name.trim() === "") return { field: "name", key: "required" };
  if (id.trim() === "") return { field: "id", key: "required" };
  if (!isValidCustomProfileId(id.trim()) || isBuiltinProfileAlias(id.trim())) {
    return { field: "id", key: "idInvalid" };
  }
  if (description.trim() === "") return { field: "description", key: "required" };
  if (!(REPROMPT_LEVELS as readonly string[]).includes(defaultLevel)) {
    return { field: "defaultLevel", key: "levelInvalid" };
  }
  if (instructions.trim() === "") return { field: "instructions", key: "required" };
  return undefined;
}

/**
 * The form as a storable profile.
 *
 * Throws when the form is invalid: callers check `findProfileFormProblem` first,
 * and reaching here with a problem is a programming error rather than user
 * input. The schema validates again at the write, so this is a convenience, not
 * the security boundary.
 */
export function profileFromForm(state: ProfileFormState): CustomProfile {
  const problem = findProfileFormProblem(state);
  if (problem) {
    throw new Error(`Le formulaire de profil est incomplet : ${problem.field} (${problem.key}).`);
  }

  const base = state.values.extends.trim();
  return {
    schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
    id: state.values.id.trim(),
    name: state.values.name.trim(),
    description: state.values.description.trim(),
    ...(base === "" ? {} : { extends: base as CustomProfile["extends"] }),
    defaultLevel: state.values.defaultLevel as RepromptLevel,
    instructions: state.values.instructions.trim(),
  };
}
