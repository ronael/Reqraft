import { describe, expect, it } from "vitest";
import {
  CUSTOM_PROFILE_ID_MAX_LENGTH,
  CUSTOM_PROFILE_ID_REGEX,
  CUSTOM_PROFILE_SCHEMA_VERSION,
  CustomProfileSchema,
  customProfileToPromptProfile,
  isValidCustomProfileId,
  parseCustomProfile,
  serializeCustomProfile,
  type CustomProfile,
} from "@/profiles/custom.js";
import { BUILTIN_PROFILE_IDS } from "@/profiles/profile-ids.js";
import { getBuiltinProfile } from "@/profiles/builtins.js";

const VALID_CUSTOM_PROFILE: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule les réponses destinées au support.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Rédige une réponse empathique, précise et actionnable.",
};

describe("custom profile schema version 1", () => {
  it("validates a compliant custom profile", () => {
    const parsed = CustomProfileSchema.parse(VALID_CUSTOM_PROFILE);
    expect(parsed).toEqual(VALID_CUSTOM_PROFILE);
  });

  it("exports schema version 1 constant", () => {
    expect(CUSTOM_PROFILE_SCHEMA_VERSION).toBe(1);
  });

  it("requires schemaVersion to be exactly 1", () => {
    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        schemaVersion: 2,
      }),
    ).toThrow();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        schemaVersion: "1",
      }),
    ).toThrow();

    const withoutVersion: Record<string, unknown> = { ...VALID_CUSTOM_PROFILE };
    delete withoutVersion.schemaVersion;
    expect(() => CustomProfileSchema.parse(withoutVersion)).toThrow();
  });

  it("enforces strictness: rejects unknown extra fields", () => {
    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        extraProperty: "not-allowed",
      }),
    ).toThrow();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        aliases: ["sc"],
      }),
    ).toThrow();
  });

  it("trims name, description, and instructions and rejects empty values", () => {
    const parsed = CustomProfileSchema.parse({
      ...VALID_CUSTOM_PROFILE,
      name: "  Support client  ",
      description: "  Reformule les réponses.  ",
      instructions: "  Consignes spécifiques.  ",
    });

    expect(parsed.name).toBe("Support client");
    expect(parsed.description).toBe("Reformule les réponses.");
    expect(parsed.instructions).toBe("Consignes spécifiques.");

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        name: "   ",
      }),
    ).toThrow();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        description: "   ",
      }),
    ).toThrow();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        instructions: "   ",
      }),
    ).toThrow();
  });

  it("requires defaultLevel to be a valid reprompt level", () => {
    for (const level of ["minimal", "standard", "complete"] as const) {
      const parsed = CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        defaultLevel: level,
      });
      expect(parsed.defaultLevel).toBe(level);
    }

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        defaultLevel: "ultra",
      }),
    ).toThrow();

    const withoutLevel: Record<string, unknown> = { ...VALID_CUSTOM_PROFILE };
    delete withoutLevel.defaultLevel;
    expect(() => CustomProfileSchema.parse(withoutLevel)).toThrow();
  });

  it("restricts extends to valid built-in profile ids only", () => {
    for (const builtinId of BUILTIN_PROFILE_IDS) {
      const parsed = CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        extends: builtinId,
      });
      expect(parsed.extends).toBe(builtinId);
    }

    const withoutExtends: Record<string, unknown> = { ...VALID_CUSTOM_PROFILE };
    delete withoutExtends.extends;
    expect(CustomProfileSchema.parse(withoutExtends).extends).toBeUndefined();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        extends: "auto",
      }),
    ).toThrow();

    expect(() =>
      CustomProfileSchema.parse({
        ...VALID_CUSTOM_PROFILE,
        extends: "non-existent-profile",
      }),
    ).toThrow();
  });
});

describe("custom profile id validation", () => {
  const validIds = ["support-client", "code-review-v2", "a", "1", "custom-123-abc", "a-b-c-d"];

  const invalidIds = [
    "",
    "   ",
    "Support-Client",
    "support_client",
    "-support",
    "support-",
    "support--client",
    "support client",
    "support.client",
    "support/client",
    "../support",
    "../../etc/passwd",
    "support@client",
  ];

  it("accepts normalized kebab-case ids", () => {
    for (const id of validIds) {
      expect(CUSTOM_PROFILE_ID_REGEX.test(id)).toBe(true);
      expect(isValidCustomProfileId(id)).toBe(true);
      expect(() =>
        CustomProfileSchema.parse({
          ...VALID_CUSTOM_PROFILE,
          id,
        }),
      ).not.toThrow();
    }
  });

  it("rejects invalid ids with regex", () => {
    for (const id of invalidIds) {
      expect(CUSTOM_PROFILE_ID_REGEX.test(id)).toBe(false);
      expect(isValidCustomProfileId(id)).toBe(false);
      expect(() =>
        CustomProfileSchema.parse({
          ...VALID_CUSTOM_PROFILE,
          id,
        }),
      ).toThrow();
    }
  });

  it("rejects ids longer than the file name budget", () => {
    const tooLong = "a".repeat(CUSTOM_PROFILE_ID_MAX_LENGTH + 1);
    expect(isValidCustomProfileId(tooLong)).toBe(false);
    expect(() => CustomProfileSchema.parse({ ...VALID_CUSTOM_PROFILE, id: tooLong })).toThrow();

    const longest = "a".repeat(CUSTOM_PROFILE_ID_MAX_LENGTH);
    expect(isValidCustomProfileId(longest)).toBe(true);
    expect(() => CustomProfileSchema.parse({ ...VALID_CUSTOM_PROFILE, id: longest })).not.toThrow();
  });

  it("rejects ids reserved as device names by Windows", () => {
    for (const id of ["con", "prn", "aux", "nul", "com1", "lpt9"]) {
      expect(CUSTOM_PROFILE_ID_REGEX.test(id)).toBe(true);
      expect(isValidCustomProfileId(id)).toBe(false);
      expect(() => CustomProfileSchema.parse({ ...VALID_CUSTOM_PROFILE, id })).toThrow();
    }

    expect(isValidCustomProfileId("con-support")).toBe(true);
    expect(isValidCustomProfileId("com10")).toBe(true);
  });

  it("reports an invalid id on the id field", () => {
    const result = CustomProfileSchema.safeParse({ ...VALID_CUSTOM_PROFILE, id: "auto" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["id"]);
  });

  it("rejects non-string ids", () => {
    expect(isValidCustomProfileId(null)).toBe(false);
    expect(isValidCustomProfileId(undefined)).toBe(false);
    expect(isValidCustomProfileId(42)).toBe(false);
  });

  it("rejects reserved and built-in ids", () => {
    expect(isValidCustomProfileId("auto")).toBe(false);
    expect(() => CustomProfileSchema.parse({ ...VALID_CUSTOM_PROFILE, id: "auto" })).toThrow();
    for (const id of BUILTIN_PROFILE_IDS) {
      expect(isValidCustomProfileId(id)).toBe(false);
      expect(() => CustomProfileSchema.parse({ ...VALID_CUSTOM_PROFILE, id })).toThrow();
    }
  });
});

describe("custom profile parsing and serialization", () => {
  it("parses valid JSON string", () => {
    const json = JSON.stringify(VALID_CUSTOM_PROFILE);
    const parsed = parseCustomProfile(json);
    expect(parsed).toEqual(VALID_CUSTOM_PROFILE);
  });

  it("parses valid JS object", () => {
    const parsed = parseCustomProfile(VALID_CUSTOM_PROFILE);
    expect(parsed).toEqual(VALID_CUSTOM_PROFILE);
  });

  it("throws on malformed JSON string", () => {
    expect(() => parseCustomProfile("not json {")).toThrow("JSON invalide");
  });

  it("serializes profile to formatted JSON ending with newline", () => {
    const serialized = serializeCustomProfile(VALID_CUSTOM_PROFILE);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized)).toEqual(VALID_CUSTOM_PROFILE);
  });

  it("converts a standalone CustomProfile to PromptProfile", () => {
    const standalone: CustomProfile = { ...VALID_CUSTOM_PROFILE };
    delete standalone.extends;
    const promptProfile = customProfileToPromptProfile(standalone);
    expect(promptProfile).toEqual({
      id: "support-client",
      name: "Support client",
      description: "Reformule les réponses destinées au support.",
      instructions: "Rédige une réponse empathique, précise et actionnable.",
      defaultLevel: "standard",
    });
  });
});

describe("extends resolution", () => {
  const parent = getBuiltinProfile("clean");

  it("prepends the parent instructions and keeps the child level", () => {
    expect(parent).toBeDefined();
    const promptProfile = customProfileToPromptProfile(VALID_CUSTOM_PROFILE, parent);

    expect(promptProfile.instructions).toBe(
      `${parent?.instructions ?? ""}\n\nRédige une réponse empathique, précise et actionnable.`,
    );
    // `defaultLevel` is mandatory on a custom profile, so the child always wins.
    expect(promptProfile.defaultLevel).toBe("standard");
    expect(parent?.defaultLevel).not.toBe("standard");
    expect(promptProfile.name).toBe("Support client");
  });

  it("refuses to produce a PromptProfile with an unresolved parent", () => {
    expect(() => customProfileToPromptProfile(VALID_CUSTOM_PROFILE)).toThrow("support-client");
    expect(() =>
      customProfileToPromptProfile(VALID_CUSTOM_PROFILE, getBuiltinProfile("code")),
    ).toThrow("support-client");
  });

  it("refuses a parent when the profile extends nothing", () => {
    const standalone: CustomProfile = { ...VALID_CUSTOM_PROFILE };
    delete standalone.extends;
    expect(() => customProfileToPromptProfile(standalone, parent)).toThrow("support-client");
  });
});
