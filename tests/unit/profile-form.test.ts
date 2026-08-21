import { describe, expect, it } from "vitest";
import {
  PROFILE_FORM_FIELDS,
  createProfileForm,
  cycleChoice,
  duplicateProfileForm,
  editProfileForm,
  findProfileFormProblem,
  isIdEditable,
  moveField,
  profileFromForm,
  setFieldValue,
  suggestProfileIdFromName,
} from "@/apps/cli/ui/profile-form.js";
import { isValidCustomProfileId, type CustomProfile } from "@/profiles/custom.js";
import { NEW_PROFILE_OPTION } from "@/apps/cli/ui/modal-options.js";

const STORED: CustomProfile = {
  schemaVersion: 1,
  id: "support-client",
  name: "Support client",
  description: "Reformule pour le support.",
  extends: "clean",
  defaultLevel: "standard",
  instructions: "Réponds avec empathie.",
};

/** Fills every required field so a single rule can be tested in isolation. */
function completeForm() {
  let state = createProfileForm();
  state = setFieldValue(state, "name", "Support client");
  state = setFieldValue(state, "description", "Reformule pour le support.");
  state = setFieldValue(state, "instructions", "Réponds avec empathie.");
  return state;
}

describe("suggestProfileIdFromName", () => {
  it("derives an id from a name", () => {
    expect(suggestProfileIdFromName("Support client")).toBe("support-client");
  });

  it("strips accents rather than the letters carrying them", () => {
    expect(suggestProfileIdFromName("Rédaction web")).toBe("redaction-web");
  });

  it("collapses punctuation without leaving stray dashes", () => {
    expect(suggestProfileIdFromName("  Revue — code  ")).toBe("revue-code");
  });

  it("offers nothing when the name would collide with a built-in", () => {
    expect(suggestProfileIdFromName("clean")).toBe("");
  });

  it("offers nothing when no character survives", () => {
    expect(suggestProfileIdFromName("!!!")).toBe("");
  });
});

describe("field navigation", () => {
  it("wraps in both directions", () => {
    const state = createProfileForm();
    expect(moveField(state, -1).field).toBe(PROFILE_FORM_FIELDS.length - 1);
    expect(moveField(moveField(state, -1), 1).field).toBe(0);
  });

  it("reaches every field", () => {
    let state = createProfileForm();
    const seen = new Set<number>();
    // One step per field: a full turn has to land on each index exactly once.
    for (const field of PROFILE_FORM_FIELDS) {
      seen.add(state.field);
      expect(field.id).toBeDefined();
      state = moveField(state, 1);
    }
    expect(seen.size).toBe(PROFILE_FORM_FIELDS.length);
  });
});

describe("id suggestion while typing", () => {
  it("follows the name until the id is typed into", () => {
    let state = setFieldValue(createProfileForm(), "name", "Support");
    expect(state.values.id).toBe("support");

    state = setFieldValue(state, "name", "Support client");
    expect(state.values.id).toBe("support-client");
  });

  it("stops following once the id is the user's own", () => {
    let state = setFieldValue(createProfileForm(), "name", "Support");
    state = setFieldValue(state, "id", "sav");
    state = setFieldValue(state, "name", "Support client");
    expect(state.values.id).toBe("sav");
  });

  it("never rewrites the id while editing", () => {
    // An edit must not rename the file behind the profile.
    let state = editProfileForm(STORED);
    expect(isIdEditable(state)).toBe(false);
    state = setFieldValue(state, "name", "Support niveau 2");
    expect(state.values.id).toBe("support-client");
  });
});

describe("choice fields", () => {
  it("cycles the base through none and the built-ins", () => {
    let state = createProfileForm();
    state = moveField(state, 1);
    state = moveField(state, 1);
    state = moveField(state, 1); // extends
    expect(state.values.extends).toBe("");

    state = cycleChoice(state, 1);
    expect(state.values.extends).not.toBe("");

    // Cycling back returns to "no base".
    expect(cycleChoice(state, -1).values.extends).toBe("");
  });

  it("leaves text fields alone", () => {
    const state = setFieldValue(createProfileForm(), "name", "Support");
    expect(cycleChoice(state, 1)).toEqual(state);
  });
});

describe("validation", () => {
  it("accepts a complete form", () => {
    expect(findProfileFormProblem(completeForm())).toBeUndefined();
  });

  it("reports the first missing field in field order", () => {
    const state = createProfileForm();
    expect(findProfileFormProblem(state)).toEqual({ field: "name", key: "required" });
  });

  it.each([
    // A built-in id, one of its aliases, and a string no file name could carry.
    ["clean"],
    ["web-designer"],
    ["Support Client"],
  ])("refuses %s as a local profile id", (id) => {
    const state = setFieldValue(completeForm(), "id", id);
    expect(findProfileFormProblem(state)).toEqual({ field: "id", key: "idInvalid" });
  });

  it("treats whitespace as empty", () => {
    const state = setFieldValue(completeForm(), "instructions", "   ");
    expect(findProfileFormProblem(state)).toEqual({ field: "instructions", key: "required" });
  });
});

describe("profileFromForm", () => {
  it("produces a storable profile", () => {
    expect(profileFromForm(completeForm())).toEqual({
      schemaVersion: 1,
      id: "support-client",
      name: "Support client",
      description: "Reformule pour le support.",
      defaultLevel: "standard",
      instructions: "Réponds avec empathie.",
    });
  });

  it("omits the base rather than storing an empty one", () => {
    // `extends: ""` would fail the strict schema; absence is the right shape.
    expect(profileFromForm(completeForm())).not.toHaveProperty("extends");
  });

  it("keeps a chosen base", () => {
    const state = setFieldValue(completeForm(), "extends", "clean");
    expect(profileFromForm(state).extends).toBe("clean");
  });

  it("refuses to build from an incomplete form", () => {
    expect(() => profileFromForm(createProfileForm())).toThrow();
  });

  it("round-trips an edited profile unchanged", () => {
    expect(profileFromForm(editProfileForm(STORED))).toEqual(STORED);
  });
});

describe("duplicateProfileForm", () => {
  it("carries the content but never the id", () => {
    const state = duplicateProfileForm(STORED);
    expect(state.values.instructions).toBe(STORED.instructions);
    expect(state.values.extends).toBe("clean");
    // Opening on the source id would only ever fail on save.
    expect(state.values.id).toBe("");
    expect(isIdEditable(state)).toBe(true);
  });

  it("suggests an id once the name is touched", () => {
    const state = setFieldValue(duplicateProfileForm(STORED), "name", "Support bis");
    expect(state.values.id).toBe("support-bis");
  });
});

describe("the create-profile row", () => {
  it("uses a value no stored profile can ever take", () => {
    // The picker mixes profile ids and one action in the same list, so the
    // action's value has to be unrepresentable as an id — otherwise creating a
    // profile called that would shadow the row that creates profiles.
    expect(isValidCustomProfileId(NEW_PROFILE_OPTION)).toBe(false);
  });
});
