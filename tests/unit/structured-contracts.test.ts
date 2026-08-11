import { describe, expect, it } from "vitest";
import { assessFidelity } from "../../src/core/fidelity.js";
import { parseResult } from "../../src/core/result-parser.js";
import { ReqraftError } from "../../src/core/errors.js";
import type { RepromptResult } from "../../src/core/types.js";
import { serializeJsonError, serializeJsonSuccess } from "../../src/presentation/json-contract.js";

describe("structured public contracts", () => {
  it("returns stable diagnostic parameters without presentation messages", () => {
    const quality = assessFidelity(
      "fais une landing page",
      "fais une landing page avec des témoignages et une FAQ",
      "strict",
      "standard",
    );

    expect(quality.signals).toContainEqual({
      code: "unsupported_additions",
      severity: "warning",
      params: { additions: ["testimonials", "faq"] },
    });
    expect(JSON.stringify(quality)).not.toContain("message");
    expect(JSON.stringify(quality)).not.toContain("témoignages");
  });

  it("does not invent French changes or warnings for raw model output", () => {
    expect(parseResult("raw response")).toEqual({
      rewritten: "raw response",
      changes: [],
      modelWarnings: [],
      format: "raw",
    });
  });

  it("serializes a versioned locale-neutral success envelope", () => {
    const result: RepromptResult = {
      original: "test",
      rewritten: "test improved",
      profile: "clean",
      level: "standard",
      provider: "mock",
      model: "mock-model",
      changes: [],
      quality: { status: "good", signals: [] },
      latencyMs: 12,
    };

    expect(JSON.parse(serializeJsonSuccess(result))).toEqual({
      schemaVersion: 1,
      ok: true,
      result,
    });
  });

  it("serializes a stable error without its human message, detail or cause", () => {
    const error = new ReqraftError("provider.rate_limited", 4, {
      params: { provider: "openai", httpStatus: 429 },
      detail: "safe debug detail",
      cause: new Error("secret response body"),
    });

    const serialized = JSON.parse(serializeJsonError(error)) as unknown;
    expect(serialized).toEqual({
      schemaVersion: 1,
      ok: false,
      error: {
        code: "provider.rate_limited",
        params: { provider: "openai", httpStatus: 429 },
        exitCode: 4,
      },
    });
    expect(JSON.stringify(serialized)).not.toContain("secret response body");
    expect(JSON.stringify(serialized)).not.toContain("safe debug detail");
  });
});
