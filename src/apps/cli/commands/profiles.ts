import process from "node:process";
import readline from "node:readline";
import { readFile, writeFile } from "node:fs/promises";
import { REPROMPT_LEVELS, type RepromptLevel } from "@/core/levels.js";
import { loadConfig } from "@/config/loader.js";
import { getProfilesDir } from "@/config/paths.js";
import { getBuiltinProfile, isBuiltinProfileAlias } from "@/profiles/builtins.js";
import { getProfileOrigin, loadProfileCatalog, type ProfileCatalog } from "@/profiles/catalog.js";
import {
  CUSTOM_PROFILE_SCHEMA_VERSION,
  isValidCustomProfileId,
  parseCustomProfile,
  type CustomProfile,
} from "@/profiles/custom.js";
import {
  createLocalProfile,
  deleteLocalProfile,
  getCustomProfilePath,
  readLocalProfile,
  updateLocalProfile,
} from "@/profiles/local-store.js";
import { duplicateProfile, exportProfile } from "@/profiles/transfer.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { printScreen } from "@/shared/terminal/text.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";
import { createTranslator, type Translator } from "@/i18n/translate.js";
import { formatUiError } from "@/shared/errors.js";
// One derivation rule for both surfaces: the CLI wizard and the TUI form must
// suggest the same id for the same name.
import { suggestProfileIdFromName } from "@/apps/cli/ui/profile-form.js";

export { suggestProfileIdFromName as suggestProfileId };

const DEFAULT_TRANSLATOR = createTranslator("fr");

/**
 * Number of times a question is asked again after an invalid answer. Bounded
 * so a closed or exhausted stdin ends the wizard instead of looping forever.
 */
const MAX_ANSWER_ATTEMPTS = 3;

/** Refusal shown whenever a typed id cannot become a local profile. */
const ID_INVALID_KEY = "profiles.add.idInvalid" as const;

export interface ProfilesOutput {
  log(message: string): void;
  error(message: string): void;
}

export interface ProfilesAddOptions {
  /** Non-interactive import of a strict JSON profile. */
  file?: string;
  output?: ProfilesOutput;
  ask?: (question: string) => Promise<string>;
  /** Defaults to whether stdin is a TTY: without one, the wizard cannot run. */
  interactive?: boolean;
  profilesDir?: string;
}

export interface ProfilesRemoveOptions {
  output?: ProfilesOutput;
  confirm?: (question: string) => Promise<string>;
  profilesDir?: string;
  /** The configured default profile, which must never be left dangling. */
  readDefaultProfile?: () => Promise<string>;
}

function askOnStdin(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function reportError(error: unknown, output: ProfilesOutput, t: Translator): void {
  output.error(`${t("common.error")} : ${formatUiError(error, "config", t)}`);
}

/**
 * Prints every local profile file the catalogue had to skip.
 *
 * Called at start-up and by `rp profiles`: an unusable file is always visible,
 * on stderr, instead of being silently missing from the list.
 */
export function reportProfileCatalogProblems(
  catalog: ProfileCatalog,
  output: ProfilesOutput = console,
  t: Translator = DEFAULT_TRANSLATOR,
): void {
  for (const problem of catalog.problems) {
    output.error(t("profiles.invalidFile", { path: problem.path, detail: problem.detail }));
  }
}

async function askUntilValid(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  question: string,
  validate: (answer: string) => string | undefined,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const answer = (await ask(`${question} : `)).trim();
    const problem = validate(answer);
    if (problem === undefined) return answer;
    output.error(problem);
  }
  return undefined;
}

function requiredText(t: Translator): (answer: string) => string | undefined {
  return (answer) => (answer.length > 0 ? undefined : t("profiles.add.required"));
}

async function askProfileId(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  profilesDir: string,
  t: Translator,
): Promise<string | undefined> {
  for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const answer = (await ask(`${t("profiles.add.id")} : `)).trim();
    if (answer.length === 0) {
      output.error(t("profiles.add.required"));
    } else if (!isValidCustomProfileId(answer) || isBuiltinProfileAlias(answer)) {
      output.error(t(ID_INVALID_KEY));
    } else if (await localProfileExists(answer, profilesDir)) {
      // The atomic write is what actually forbids an overwrite; asking again
      // here only spares the user a failed run.
      output.error(t("profiles.add.idTaken", { id: answer }));
    } else {
      return answer;
    }
  }
  return undefined;
}

async function localProfileExists(id: string, profilesDir: string): Promise<boolean> {
  try {
    await readLocalProfile(id, profilesDir);
    return true;
  } catch {
    // Unreadable or absent: the atomic write below settles the question, and
    // an unreadable file is already reported by the catalogue.
    return false;
  }
}

async function askLevel(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  t: Translator,
): Promise<RepromptLevel | undefined> {
  const allowed = REPROMPT_LEVELS.join(" | ");
  const answer = await askUntilValid(
    ask,
    output,
    `${t("profiles.add.level")} (${allowed})`,
    (value) =>
      (REPROMPT_LEVELS as readonly string[]).includes(value)
        ? undefined
        : t("profiles.add.levelInvalid", { allowed }),
  );
  return answer as RepromptLevel | undefined;
}

/**
 * Asks for the id, offering `suggested` as the Enter default.
 *
 * The taken-id check here only spares the user a failed run: the atomic write
 * is what actually forbids an overwrite, including against a concurrent
 * creation.
 */
async function askProfileIdWithSuggestion(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  profilesDir: string,
  suggested: string,
  t: Translator,
): Promise<string | undefined> {
  if (suggested === "") return askProfileId(ask, output, profilesDir, t);

  for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const typed = (await ask(`${t("profiles.add.idSuggested", { id: suggested })} : `)).trim();
    const answer = typed.length === 0 ? suggested : typed;
    if (!isValidCustomProfileId(answer) || isBuiltinProfileAlias(answer)) {
      output.error(t(ID_INVALID_KEY));
    } else if (await localProfileExists(answer, profilesDir)) {
      output.error(t("profiles.add.idTaken", { id: answer }));
    } else {
      return answer;
    }
  }
  return undefined;
}

/**
 * Asks for an optional built-in base. Empty means none, which is the common
 * case — a profile that inherits nothing is complete on its own.
 */
async function askBase(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  t: Translator,
  current?: string,
): Promise<{ value?: string } | undefined> {
  const allowed = BUILTIN_PROFILE_IDS.join(" | ");
  for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const question =
      current === undefined
        ? `${t("profiles.add.base", { allowed })} : `
        : `${t("profiles.add.base", { allowed })} [${current}] : `;
    const answer = (await ask(question)).trim();
    if (answer.length === 0) {
      return { value: current };
    }
    if (answer === "-") {
      // An explicit way to clear an inherited base while editing, since an
      // empty answer already means "keep what is there".
      return { value: undefined };
    }
    if ((BUILTIN_PROFILE_IDS as readonly string[]).includes(answer)) {
      return { value: answer };
    }
    output.error(t("profiles.add.baseInvalid", { allowed }));
  }
  return undefined;
}

async function runInteractiveAdd(
  options: ProfilesAddOptions,
  output: ProfilesOutput,
  profilesDir: string,
  t: Translator,
): Promise<CustomProfile | undefined> {
  const ask = options.ask ?? askOnStdin;
  printScreen(t("profiles.add.title"), t("profiles.add.subtitle"), output);

  // Name first: the id is derived from it, so asking the other way round would
  // make the suggestion impossible.
  const name = await askUntilValid(ask, output, t("profiles.add.name"), requiredText(t));
  if (name === undefined) return undefined;
  const id = await askProfileIdWithSuggestion(
    ask,
    output,
    profilesDir,
    suggestProfileIdFromName(name),
    t,
  );
  if (id === undefined) return undefined;
  const description = await askUntilValid(
    ask,
    output,
    t("profiles.add.description"),
    requiredText(t),
  );
  if (description === undefined) return undefined;
  const base = await askBase(ask, output, t);
  if (base === undefined) return undefined;
  const defaultLevel = await askLevel(ask, output, t);
  if (defaultLevel === undefined) return undefined;
  const instructions = await askUntilValid(
    ask,
    output,
    t("profiles.add.instructions"),
    requiredText(t),
  );
  if (instructions === undefined) return undefined;

  return {
    schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
    id,
    name,
    description,
    ...(base.value === undefined ? {} : { extends: base.value as CustomProfile["extends"] }),
    defaultLevel,
    instructions,
  };
}

async function readProfileFile(
  file: string,
  output: ProfilesOutput,
  t: Translator,
): Promise<CustomProfile | undefined> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    output.error(t("profiles.add.fileUnreadable", { path: file }));
    return undefined;
  }

  try {
    return parseCustomProfile(content);
  } catch (error) {
    output.error(
      t("profiles.add.fileInvalid", {
        path: file,
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
    return undefined;
  }
}

/**
 * `rp profiles add` — interactive wizard, or strict JSON import with `--file`.
 *
 * Never overwrites: the profile file is published atomically and an id already
 * taken is refused, including by a concurrent creation.
 */
export async function runProfilesAdd(
  options: ProfilesAddOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const profilesDir = options.profilesDir ?? getProfilesDir();

  let profile: CustomProfile | undefined;
  if (options.file === undefined) {
    if (!(options.interactive ?? process.stdin.isTTY)) {
      output.error(t("profiles.add.needsTerminal"));
      return EXIT_CODES.INVALID_INPUT;
    }
    profile = await runInteractiveAdd(options, output, profilesDir, t);
    if (profile === undefined) {
      output.error(t("profiles.add.abandoned"));
      return EXIT_CODES.INVALID_INPUT;
    }
  } else {
    profile = await readProfileFile(options.file, output, t);
    if (profile === undefined) return EXIT_CODES.INVALID_INPUT;
  }

  // The schema already refuses a built-in id; an alias is the remaining
  // collision, and it belongs to the built-in profile that declares it.
  if (isBuiltinProfileAlias(profile.id)) {
    output.error(t(ID_INVALID_KEY));
    return EXIT_CODES.INVALID_INPUT;
  }

  try {
    const path = await createLocalProfile(profile, { profilesDir });
    await loadProfileCatalog({ profilesDir });
    output.log(t("profiles.add.created", { id: profile.id, path }));
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
}

/**
 * `rp profiles remove <id>` — deletes a local profile after confirmation.
 *
 * Refuses `auto`, the built-in profiles and their aliases. Refuses too a
 * profile still named by `defaultProfile`: leaving the configuration pointing
 * at a profile that no longer exists would turn every later run into an
 * unknown-profile failure.
 */
export async function runProfilesRemove(
  id: string | undefined,
  options: ProfilesRemoveOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const confirm = options.confirm ?? askOnStdin;
  const profilesDir = options.profilesDir ?? getProfilesDir();

  if (!id) {
    output.error(t("profiles.remove.usage"));
    return EXIT_CODES.INVALID_INPUT;
  }
  if (id === AUTO_PROFILE_ID || getBuiltinProfile(id) || isBuiltinProfileAlias(id)) {
    output.error(t("profiles.remove.builtin", { id }));
    return EXIT_CODES.INVALID_INPUT;
  }
  // Un profil du projet est un fichier du dépôt : le supprimer d'ici toucherait
  // le travail de tout le monde, et `deleteLocalProfile` ne le trouverait même
  // pas — il ne regarde que le dossier personnel.
  if (getProfileOrigin(id) === "project") {
    output.error(t("profiles.remove.project", { id }));
    return EXIT_CODES.INVALID_INPUT;
  }
  if (!isValidCustomProfileId(id)) {
    output.error(t("profiles.remove.unknown", { id }));
    return EXIT_CODES.INVALID_INPUT;
  }

  const filePath = getCustomProfilePath(id, profilesDir);
  const readDefaultProfile =
    options.readDefaultProfile ??
    (async (): Promise<string> => (await loadConfig()).defaultProfile);
  if ((await readDefaultProfile()) === id) {
    output.error(t("profiles.remove.isDefault", { id }));
    return EXIT_CODES.INVALID_CONFIGURATION;
  }

  const answer = (await confirm(t("profiles.remove.confirm", { id }))).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    output.log(t("profiles.remove.cancelled"));
    return EXIT_CODES.SUCCESS;
  }

  try {
    await deleteLocalProfile(id, profilesDir);
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_INPUT;
  }

  await loadProfileCatalog({ profilesDir });
  output.log(t("profiles.remove.done", { id, path: filePath }));
  return EXIT_CODES.SUCCESS;
}

export interface ProfilesEditOptions {
  output?: ProfilesOutput;
  ask?: (question: string) => Promise<string>;
  interactive?: boolean;
  profilesDir?: string;
}

/**
 * Why a given id cannot be written to, or `undefined` when it can.
 *
 * Shared by `edit` and `remove` so "this is a built-in" and "this does not
 * exist" are told apart the same way by both — a built-in gets the pointer to
 * `duplicate`, a typo gets "unknown".
 */
function findWriteRefusal(id: string, t: Translator): string | undefined {
  if (id === AUTO_PROFILE_ID || getBuiltinProfile(id) || isBuiltinProfileAlias(id)) {
    return t("profiles.edit.builtin", { id });
  }
  if (getProfileOrigin(id) === "project") {
    return t("profiles.edit.project", { id });
  }
  return isValidCustomProfileId(id) ? undefined : t("profiles.edit.unknown", { id });
}

/** Asks for one field, an empty answer keeping `current`. */
async function askWithCurrent(
  ask: (question: string) => Promise<string>,
  label: string,
  current: string,
): Promise<string> {
  const answer = (await ask(`${label} [${current}] : `)).trim();
  // Empty means "keep". That is only ambiguous if the stored value were empty,
  // and the schema forbids that — so there is nothing to disambiguate and no
  // reason to ask again.
  return answer.length > 0 ? answer : current;
}

/**
 * `rp profiles edit <id>` — rewrites a local profile, field by field.
 *
 * Built-in profiles are refused here rather than failing at the write: the
 * message names `duplicate` as the way to get an editable copy, which is the
 * action the user actually wanted.
 */
export async function runProfilesEdit(
  id: string | undefined,
  options: ProfilesEditOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const profilesDir = options.profilesDir ?? getProfilesDir();

  if (!id) {
    output.error(t("profiles.edit.usage"));
    return EXIT_CODES.INVALID_INPUT;
  }

  const refusal = findWriteRefusal(id, t);
  if (refusal !== undefined) {
    output.error(refusal);
    return EXIT_CODES.INVALID_INPUT;
  }

  if (!(options.interactive ?? process.stdin.isTTY)) {
    output.error(t("profiles.edit.needsTerminal"));
    return EXIT_CODES.INVALID_INPUT;
  }

  let existing: CustomProfile;
  try {
    existing = await readLocalProfile(id, profilesDir);
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_INPUT;
  }

  const ask = options.ask ?? askOnStdin;
  printScreen(t("profiles.edit.title"), t("profiles.edit.subtitle", { id }), output);
  output.log(t("profiles.edit.keepHint"));

  const name = await askWithCurrent(ask, t("profiles.add.name"), existing.name);
  const description = await askWithCurrent(
    ask,
    t("profiles.add.description"),
    existing.description,
  );
  const base = await askBase(ask, output, t, existing.extends);
  if (base === undefined) return abandonEdit(output, t);
  const defaultLevel = await askLevelWithCurrent(ask, output, existing.defaultLevel, t);
  if (defaultLevel === undefined) return abandonEdit(output, t);
  const instructions = await askWithCurrent(
    ask,
    t("profiles.add.instructions"),
    existing.instructions,
  );

  const updated: CustomProfile = {
    schemaVersion: CUSTOM_PROFILE_SCHEMA_VERSION,
    id: existing.id,
    name,
    description,
    ...(base.value === undefined ? {} : { extends: base.value as CustomProfile["extends"] }),
    defaultLevel,
    instructions,
  };

  try {
    const path = await updateLocalProfile(updated, { profilesDir });
    await loadProfileCatalog({ profilesDir });
    output.log(t("profiles.edit.done", { id: updated.id, path }));
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
}

function abandonEdit(output: ProfilesOutput, t: Translator): number {
  output.error(t("profiles.edit.abandoned"));
  return EXIT_CODES.INVALID_INPUT;
}

async function askLevelWithCurrent(
  ask: (question: string) => Promise<string>,
  output: ProfilesOutput,
  current: RepromptLevel,
  t: Translator,
): Promise<RepromptLevel | undefined> {
  const allowed = REPROMPT_LEVELS.join(" | ");
  for (let attempt = 0; attempt < MAX_ANSWER_ATTEMPTS; attempt++) {
    const answer = (await ask(`${t("profiles.add.level")} (${allowed}) [${current}] : `)).trim();
    if (answer.length === 0) return current;
    if ((REPROMPT_LEVELS as readonly string[]).includes(answer)) return answer as RepromptLevel;
    output.error(t("profiles.add.levelInvalid", { allowed }));
  }
  return undefined;
}

export interface ProfilesDuplicateOptions {
  output?: ProfilesOutput;
  name?: string;
  profilesDir?: string;
}

/**
 * `rp profiles duplicate <source> <target>` — copies any profile into a new
 * local one.
 *
 * Non-interactive on purpose: both ids are arguments, so it composes in a
 * script. Duplicating a built-in flattens its instructions into the copy, which
 * is said on stderr — the copy is standalone, not a live reference.
 */
export async function runProfilesDuplicate(
  source: string | undefined,
  target: string | undefined,
  options: ProfilesDuplicateOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const profilesDir = options.profilesDir ?? getProfilesDir();

  if (!source || !target) {
    output.error(t("profiles.duplicate.usage"));
    return EXIT_CODES.INVALID_INPUT;
  }
  if (!isValidCustomProfileId(target) || isBuiltinProfileAlias(target)) {
    output.error(t(ID_INVALID_KEY));
    return EXIT_CODES.INVALID_INPUT;
  }

  try {
    const result = await duplicateProfile(source, target, { profilesDir, name: options.name });
    await loadProfileCatalog({ profilesDir });
    if (result.fromBuiltin) {
      output.error(t("profiles.duplicate.flattened", { source }));
    }
    output.log(t("profiles.duplicate.done", { source, id: target, path: result.path }));
    return EXIT_CODES.SUCCESS;
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
}

export interface ProfilesExportOptions {
  output?: ProfilesOutput;
  /** Writes to this file instead of standard output. */
  file?: string;
  /** Id carried by the document, overriding the derived one. */
  exportId?: string;
  profilesDir?: string;
}

/**
 * `rp profiles export <id>` — writes a portable JSON document.
 *
 * The document goes to stdout so `rp profiles export mine > mine.json` works;
 * every note goes to stderr, so a redirect captures JSON and nothing else.
 */
export async function runProfilesExport(
  id: string | undefined,
  options: ProfilesExportOptions = {},
  t: Translator = DEFAULT_TRANSLATOR,
): Promise<number> {
  const output = options.output ?? console;
  const profilesDir = options.profilesDir ?? getProfilesDir();

  if (!id) {
    output.error(t("profiles.export.usage"));
    return EXIT_CODES.INVALID_INPUT;
  }

  let result;
  try {
    result = await exportProfile(id, { profilesDir, exportId: options.exportId });
  } catch (error) {
    reportError(error, output, t);
    return EXIT_CODES.INVALID_INPUT;
  }

  if (result.renamedFrom !== undefined) {
    output.error(
      t("profiles.export.renamed", { source: result.renamedFrom, id: result.exportedId }),
    );
  }

  if (options.file === undefined) {
    // Already newline-terminated by the serialiser; `log` must not add another.
    output.log(result.json.trimEnd());
    return EXIT_CODES.SUCCESS;
  }

  try {
    await writeFile(options.file, result.json, "utf8");
  } catch {
    output.error(t("profiles.export.unwritable", { path: options.file }));
    return EXIT_CODES.INVALID_CONFIGURATION;
  }
  output.error(t("profiles.export.written", { id: result.exportedId, path: options.file }));
  return EXIT_CODES.SUCCESS;
}
