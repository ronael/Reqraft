/**
 * Crash reporter policy (DESKTOP.md §5.7).
 *
 * The README promises "no telemetry": the crash reporter is the one Electron
 * subsystem that would break that promise by design, so the policy is an
 * explicit, exported constant — and `tests/unit/desktop-crash-report.test.ts`
 * fails the moment anyone re-enables it. The reporter is never started;
 * `applyCrashReportPolicy` exists so there is exactly one place to audit.
 */

export interface CrashReportPolicy {
  enabled: boolean;
  submitUrl: string;
  uploadToServer: boolean;
}

export const CRASH_REPORT_POLICY: CrashReportPolicy = {
  enabled: false,
  submitUrl: "",
  uploadToServer: false,
};

/** Minimal slice of Electron's `crashReporter`, injected for testability. */
export interface CrashReporterLike {
  start(options: { submitURL: string; uploadToServer: boolean }): void;
}

export function applyCrashReportPolicy(
  crashReporter: CrashReporterLike,
  policy: CrashReportPolicy = CRASH_REPORT_POLICY,
): void {
  if (!policy.enabled) {
    // Deliberately nothing: the crash reporter stays off.
    return;
  }
  crashReporter.start({ submitURL: policy.submitUrl, uploadToServer: policy.uploadToServer });
}
