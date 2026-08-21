import { z } from "zod";
import { RepromptLevelSchema } from "@/core/levels.js";
import { AUTO_PROFILE_ID, BUILTIN_PROFILE_IDS } from "./profile-ids.js";
import type { PromptProfile } from "./types.js";

export const CUSTOM_PROFILE_SCHEMA_VERSION = 1 as const;
export const CUSTOM_PROFILE_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The id becomes a file name, so it must stay well below the 255 bytes accepted
 * by usual file systems.
 */
export const CUSTOM_PROFILE_ID_MAX_LENGTH = 64;

/**
 * Windows resolves these names as devices whatever the extension, so a profile
 * file derived from such an id is not creatable there. They are refused on every
 * platform to keep a profile file portable from one machine to another.
 */
const RESERVED_DEVICE_ID_REGEX = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

const CUSTOM_PROFILE_ID_ERROR =
  "L'identifiant du profil doit être normalisé (lettres minuscules, chiffres et tirets, ex: support-client), non réservé et différent d'un profil intégré.";

export function isValidCustomProfileId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  if (id.length > CUSTOM_PROFILE_ID_MAX_LENGTH) return false;
  if (!CUSTOM_PROFILE_ID_REGEX.test(id)) return false;
  if (id === AUTO_PROFILE_ID) return false;
  if ((BUILTIN_PROFILE_IDS as readonly string[]).includes(id)) return false;
  return !RESERVED_DEVICE_ID_REGEX.test(id);
}

export const CustomProfileSchema = z
  .object({
    schemaVersion: z.literal(CUSTOM_PROFILE_SCHEMA_VERSION),
    id: z
      .string()
      .max(
        CUSTOM_PROFILE_ID_MAX_LENGTH,
        `L'identifiant du profil ne peut pas dépasser ${String(CUSTOM_PROFILE_ID_MAX_LENGTH)} caractères.`,
      )
      .regex(CUSTOM_PROFILE_ID_REGEX, CUSTOM_PROFILE_ID_ERROR),
    name: z.string().trim().min(1, "Le nom du profil ne peut pas être vide."),
    description: z.string().trim().min(1, "La description du profil ne peut pas être vide."),
    extends: z.enum(BUILTIN_PROFILE_IDS).optional(),
    defaultLevel: RepromptLevelSchema,
    instructions: z.string().trim().min(1, "Les instructions du profil ne peuvent pas être vides."),
  })
  .strict()
  .refine((profile) => isValidCustomProfileId(profile.id), {
    message: CUSTOM_PROFILE_ID_ERROR,
    path: ["id"],
  });

export type CustomProfile = z.infer<typeof CustomProfileSchema>;

export function parseCustomProfile(source: unknown): CustomProfile {
  let data: unknown;
  if (typeof source === "string") {
    try {
      data = JSON.parse(source);
    } catch (error) {
      throw new Error(
        `JSON invalide pour le profil : ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  } else {
    data = source;
  }
  return CustomProfileSchema.parse(data);
}

export function serializeCustomProfile(profile: CustomProfile): string {
  const validated = CustomProfileSchema.parse(profile);
  return JSON.stringify(validated, null, 2) + "\n";
}

/**
 * Turns a stored profile into the shape the engine consumes.
 *
 * `extends` is resolved here and nowhere else: a `PromptProfile` never carries
 * an unresolved parent, so no consumer can forget to apply it. The parent's
 * instructions come first and the child's follow, so the child specialises
 * what it inherits. `defaultLevel` is the child's, always: the field is
 * mandatory on a custom profile, so there is nothing to inherit.
 *
 * The caller must hand over the parent named by `extends` — a mismatch is a
 * programming error, not a user error, and fails loudly.
 */
export function customProfileToPromptProfile(
  custom: CustomProfile,
  parent?: PromptProfile,
): PromptProfile {
  if (custom.extends !== undefined && parent?.id !== custom.extends) {
    throw new Error(
      `Le profil « ${custom.id} » étend « ${custom.extends} » : ce profil intégré doit être fourni pour résoudre les instructions héritées.`,
    );
  }
  if (custom.extends === undefined && parent !== undefined) {
    throw new Error(
      `Le profil « ${custom.id} » n'étend aucun profil intégré : aucun parent ne doit être fourni.`,
    );
  }

  return {
    id: custom.id,
    name: custom.name,
    description: custom.description,
    instructions:
      parent === undefined
        ? custom.instructions
        : `${parent.instructions}\n\n${custom.instructions}`,
    defaultLevel: custom.defaultLevel,
  };
}
