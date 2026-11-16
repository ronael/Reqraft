import { describe, expect, it, vi } from "vitest";
import type { ExecuteRepromptInput, ExecuteRepromptResult } from "@/application/reprompt.js";
import { RepromptService } from "@/apps/desktop/main/reprompt-service.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import { createFakeSender, FAKE_RESULT, MOCK_CONFIG } from "./desktop-ipc-harness.js";

/**
 * Ce que le processus principal garde des runs terminés.
 *
 * Chaque résultat restait dans une table jusqu'à ce que l'on quitte
 * l'application : texte de départ et reformulation, run après run. Une
 * fenêtre n'accepte pourtant que le résultat de son dernier run — la capsule
 * et le popover lâchent le précédent dès qu'ils en lancent un autre.
 */

/** Un moteur dont chaque run se termine quand le test le décide. */
function engine(): {
  execute: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>;
  finish: (index: number) => void;
} {
  const pending: ((value: ExecuteRepromptResult) => void)[] = [];
  return {
    execute: vi.fn(
      () =>
        new Promise<ExecuteRepromptResult>((resolve) => {
          pending.push(resolve);
        }),
    ),
    finish: (index) => {
      pending[index]?.({
        result: { ...FAKE_RESULT, rewritten: `result ${String(index + 1)}` },
        detectedProfile: false,
      });
    },
  };
}

function service(execute: (input: ExecuteRepromptInput) => Promise<ExecuteRepromptResult>) {
  let runs = 0;
  return new RepromptService({
    executeReprompt: execute,
    loadConfig: () => Promise.resolve(MOCK_CONFIG),
    env: {},
    createRunId: () => {
      runs += 1;
      return `run-${String(runs)}`;
    },
  });
}

async function finished(window: ReturnType<typeof createFakeSender>, runId: string): Promise<void> {
  await vi.waitFor(() => {
    expect(
      window.sent.some(
        ({ channel, payload }) =>
          channel === IPC_CHANNELS.runDone && (payload as { runId: string }).runId === runId,
      ),
    ).toBe(true);
  });
}

describe("résultats gardés par le processus principal", () => {
  it("ne garde que le dernier run d'une fenêtre", async () => {
    const { execute, finish } = engine();
    const runs = service(execute);
    const capsule = createFakeSender();

    await runs.start({ input: "première demande" }, capsule.sender);
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(1);
    });
    finish(0);
    await finished(capsule, "run-1");
    expect(runs.storedResult("run-1")?.rewritten).toBe("result 1");

    await runs.start({ input: "deuxième demande" }, capsule.sender);
    expect(runs.storedResult("run-1")).toBeUndefined();
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
    });
    finish(1);
    await finished(capsule, "run-2");
    expect(runs.storedResult("run-2")?.rewritten).toBe("result 2");
  });

  it("garde le dernier run de chaque fenêtre", async () => {
    const { execute, finish } = engine();
    const runs = service(execute);
    const capsule = createFakeSender();
    const popover = createFakeSender();

    await runs.start({ input: "depuis la capsule" }, capsule.sender);
    await runs.start({ input: "depuis le popover" }, popover.sender);
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
    });
    finish(0);
    finish(1);
    await finished(capsule, "run-1");
    await finished(popover, "run-2");

    expect(runs.storedResult("run-1")?.rewritten).toBe("result 1");
    expect(runs.storedResult("run-2")?.rewritten).toBe("result 2");
  });

  it("ne garde pas un run qui se termine après que sa fenêtre en a lancé un autre", async () => {
    const { execute, finish } = engine();
    const runs = service(execute);
    const capsule = createFakeSender();

    await runs.start({ input: "première demande" }, capsule.sender);
    await runs.start({ input: "deuxième demande" }, capsule.sender);
    await vi.waitFor(() => {
      expect(execute).toHaveBeenCalledTimes(2);
    });
    finish(0);
    await finished(capsule, "run-1");

    expect(runs.storedResult("run-1")).toBeUndefined();
  });
});
