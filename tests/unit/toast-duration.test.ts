import { describe, expect, it } from "vitest";
import { TOAST_MAXIMUM_MS, TOAST_MINIMUM_MS, toastDurationMs } from "@/apps/cli/ui/toast.js";

describe("toastDurationMs", () => {
  it("gives a short confirmation time to notice and read", () => {
    // The previous fixed 1.5 s was under this: the toast was gone before a
    // glance away and back could catch it.
    expect(toastDurationMs("✓ Copié")).toBeGreaterThanOrEqual(TOAST_MINIMUM_MS);
  });

  it("gives a long message more time than a short one", () => {
    const short = toastDurationMs("✓ Copié");
    const long = toastDurationMs(
      "Exporté vers /Users/someone/projects/reqraft/support-client.reqraft-profile.json",
    );
    expect(long).toBeGreaterThan(short);
  });

  it("never lingers over the interface it covers", () => {
    const veryLong = "x".repeat(1_000);
    expect(toastDurationMs(veryLong)).toBe(TOAST_MAXIMUM_MS);
  });

  it("leaves an export path readable", () => {
    // The one message carrying information the user may act on: it has to
    // survive long enough to be read in full.
    const message = "Exporté vers /Users/someone/reqraft/support-client.reqraft-profile.json";
    expect(toastDurationMs(message)).toBeGreaterThanOrEqual(4_000);
  });

  it("is stable for an empty message", () => {
    expect(toastDurationMs("")).toBe(TOAST_MINIMUM_MS);
  });
});
