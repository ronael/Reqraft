/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiagnosticTab } from "@/apps/desktop/renderer/settings/DiagnosticTab.js";
import type { DoctorReport } from "@/apps/desktop/shared/ipc-contract.js";

afterEach(() => {
  cleanup();
});

function installBridge(): {
  openPermissionSettings: ReturnType<typeof vi.fn>;
  requestPermissions: ReturnType<typeof vi.fn>;
  resumeShortcuts: ReturnType<typeof vi.fn>;
} {
  const bridge = {
    copyDoctorReport: vi.fn(() => Promise.resolve({ copied: true })),
    openPermissionSettings: vi.fn(() => Promise.resolve()),
    requestPermissions: vi.fn(() => Promise.resolve({ accessibility: false })),
    resumeShortcuts: vi.fn(() =>
      Promise.resolve({ registered: [], rejected: [], conflicts: [], suspended: false }),
    ),
  };
  Object.defineProperty(window, "reqraft", {
    configurable: true,
    value: bridge,
  });
  return bridge;
}

const REPORT: DoctorReport = {
  checks: [
    { id: "config:file", ok: true, detail: "config.json" },
    {
      id: "provider:openai",
      ok: false,
      detail: "OPENAI_API_KEY",
      remedy: "configure-provider",
    },
    {
      id: "shortcuts:suspended",
      ok: false,
      detail: "suspended",
      remedy: "resume-shortcuts",
    },
  ],
};

describe("DiagnosticTab actions", () => {
  it("place les échecs actionnables avant les contrôles réussis", () => {
    installBridge();
    render(
      <DiagnosticTab
        doctor={REPORT}
        running={false}
        failed={false}
        onRunDoctor={() => undefined}
        onOpenTab={() => undefined}
      />,
    );

    const provider = screen.getByText("settings.diagnosticProvider", { exact: false });
    const passing = screen.getByText("settings.diagnosticConfigFile");
    expect(
      provider.compareDocumentPosition(passing) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("settings.remedy.configureProvider")).toBeTruthy();
  });

  it("ouvre l'onglet Providers sans appel système", async () => {
    const bridge = installBridge();
    const onOpenTab = vi.fn();
    const user = userEvent.setup();
    render(
      <DiagnosticTab
        doctor={REPORT}
        running={false}
        failed={false}
        onRunDoctor={() => undefined}
        onOpenTab={onOpenTab}
      />,
    );

    await user.click(screen.getByRole("button", { name: "settings.remedy.openProviders" }));
    expect(onOpenTab).toHaveBeenCalledWith("providers");
    expect(bridge.openPermissionSettings).not.toHaveBeenCalled();
  });

  it("reprend les raccourcis puis relance le diagnostic", async () => {
    const bridge = installBridge();
    const onRunDoctor = vi.fn();
    const user = userEvent.setup();
    render(
      <DiagnosticTab
        doctor={REPORT}
        running={false}
        failed={false}
        onRunDoctor={onRunDoctor}
        onOpenTab={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: "settings.remedy.resume" }));
    await waitFor(() => {
      expect(bridge.resumeShortcuts).toHaveBeenCalledTimes(1);
      expect(onRunDoctor).toHaveBeenCalledTimes(1);
    });
  });

  it("rend l'échec d'exécution en alerte et conserve la relance", () => {
    installBridge();
    render(
      <DiagnosticTab
        doctor={null}
        running={false}
        failed
        onRunDoctor={() => undefined}
        onOpenTab={() => undefined}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("settings.diagnosticFailed");
    expect(screen.getByRole("button", { name: "settings.rerunDiagnostic" })).toBeTruthy();
  });
});
