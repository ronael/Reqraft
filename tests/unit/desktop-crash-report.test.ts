import { describe, expect, it, vi } from "vitest";
import {
  applyCrashReportPolicy,
  CRASH_REPORT_POLICY,
  type CrashReporterLike,
} from "../../src/desktop/main/crash-report.js";

/**
 * DESKTOP.md §5.7: the README promises "no telemetry". These tests fail the
 * moment the crash reporter policy is re-enabled or silently started.
 */
describe("crash report policy", () => {
  it("keeps the reporter disabled in the shipped policy", () => {
    expect(CRASH_REPORT_POLICY.enabled).toBe(false);
    expect(CRASH_REPORT_POLICY.submitUrl).toBe("");
    expect(CRASH_REPORT_POLICY.uploadToServer).toBe(false);
  });

  it("never starts the reporter while the policy is disabled", () => {
    const start = vi.fn();
    const reporter: CrashReporterLike = { start };

    applyCrashReportPolicy(reporter);

    expect(start).not.toHaveBeenCalled();
  });

  it("only starts the reporter when a policy explicitly enables it", () => {
    const start = vi.fn();
    const reporter: CrashReporterLike = { start };

    applyCrashReportPolicy(reporter, {
      enabled: true,
      submitUrl: "https://crash.example.test",
      uploadToServer: true,
    });

    expect(start).toHaveBeenCalledWith({
      submitURL: "https://crash.example.test",
      uploadToServer: true,
    });
  });
});
