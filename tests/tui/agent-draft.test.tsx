/* @jsxImportSource @opentui/react */
import { describe, expect, test } from "bun:test";
import { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { registerRendererTeardown, trackRenderer } from "./harness.js";
import { OpenTuiApp, type TuiServices } from "@/apps/cli/tui/app/OpenTuiApp.js";
import type { AgentDraftSession } from "@/apps/cli/tui/app/use-agent-draft.js";
import { DEFAULT_CONFIG } from "@/config/loader.js";
import type { ExecuteRepromptInput } from "@/application/reprompt.js";
import { createTranslator } from "@/i18n/translate.js";

/**
 * The interface `rp edit` opens on a terminal agent's draft: the draft is
 * rewritten straight away, ^Y sends the result back and leaves, ^C leaves the
 * draft as it was.
 */

registerRendererTeardown();

const t = createTranslator("en");
const DRAFT = "fix the button that does nothing";

function services(executed: ExecuteRepromptInput[], bootstrapFails = false): TuiServices {
  return {
    bootstrap: () =>
      bootstrapFails
        ? Promise.reject(new Error("no provider"))
        : Promise.resolve({ config: { ...DEFAULT_CONFIG } }),
    profiles: {
      reload: () => Promise.resolve(),
      read: () => Promise.reject(new Error("not used")),
      create: () => Promise.reject(new Error("not used")),
      update: () => Promise.reject(new Error("not used")),
      remove: () => Promise.reject(new Error("not used")),
      exportToFile: () => Promise.reject(new Error("not used")),
      defaultProfile: () => Promise.resolve("auto"),
      openInEditor: () => Promise.reject(new Error("not used")),
    },
    execute: (input) => {
      executed.push(input);
      return Promise.resolve({
        result: {
          original: input.input,
          rewritten: `REWRITTEN: ${input.input}`,
          profile: "auto",
          level: "standard",
          provider: "mock",
          model: "mock-model",
          changes: [],
          quality: { status: "good", signals: [] },
          latencyMs: 10,
        },
        detectedProfile: false,
      });
    },
    readClipboard: () => Promise.resolve(""),
    writeClipboard: () => Promise.reject(new Error("an agent's draft is never copied")),
    describeError: (error) => ({ title: "Error", message: String(error) }),
  };
}

async function mountDraft(options: { bootstrapFails?: boolean } = {}) {
  const executed: ExecuteRepromptInput[] = [];
  const used: string[] = [];
  const exits: string[] = [];
  const session: AgentDraftSession = {
    draft: DRAFT,
    use: (text) => {
      used.push(text);
      return Promise.resolve();
    },
  };

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let mounted!: Awaited<ReturnType<typeof testRender>>;
  await act(async () => {
    mounted = await testRender(
      <OpenTuiApp
        t={t}
        services={services(executed, options.bootstrapFails)}
        agentDraft={session}
        onExit={() => exits.push("exit")}
      />,
      { width: 120, height: 40, exitOnCtrlC: false },
    );
  });
  const setup = trackRenderer(mounted);
  const settle = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await setup.flush();
    });
  };
  await settle();
  await settle();

  return {
    executed,
    used,
    exits,
    frame: () => setup.captureCharFrame(),
    key: async (name: string): Promise<void> => {
      await act(async () => {
        setup.mockInput.pressKey(name, { ctrl: true });
        await setup.flush();
      });
      await settle();
      await settle();
    },
  };
}

describe("OpenTuiApp · an agent's draft", () => {
  test("rewrites the draft as soon as it opens, and says how to send it back", async () => {
    const screen = await mountDraft();
    expect(screen.executed.map((input) => input.input)).toEqual([DRAFT]);
    const frame = screen.frame();
    expect(frame).toContain(`REWRITTEN: ${DRAFT}`);
    expect(frame).toContain(t("tui.command.use"));
    expect(frame).not.toContain(t("tui.command.copy"));
    expect(frame).toContain(t("tui.agentDraft.hint", { use: "^Y", exit: "^C" }));
  });

  test("^Y sends the rewrite back, then leaves", async () => {
    const screen = await mountDraft();
    await screen.key("y");
    expect(screen.used).toEqual([`REWRITTEN: ${DRAFT}`]);
    expect(screen.exits).toEqual(["exit"]);
  });

  test("^C leaves without sending anything", async () => {
    const screen = await mountDraft();
    await screen.key("c");
    expect(screen.used).toEqual([]);
    expect(screen.exits).toEqual(["exit"]);
  });

  test("a configuration that failed keeps the draft waiting, without a rewrite", async () => {
    const screen = await mountDraft({ bootstrapFails: true });
    expect(screen.executed).toEqual([]);
    const frame = screen.frame();
    expect(frame).toContain("no provider");
    // The hint toast floats over the end of the editor's first row.
    expect(frame).toContain("fix the button");
  });
});
