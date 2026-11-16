import { describe, expect, it } from "vitest";
import { setMainLocale } from "@/apps/desktop/main/i18n.js";
import { IPC_CHANNELS } from "@/apps/desktop/shared/ipc-channels.js";
import { createTranslator } from "@/i18n/translate.js";
import {
  corrompreLaConfiguration,
  dependancesSansTrousseau,
  isolerLeDossierPersonnel,
  joindreProcessusPrincipal,
} from "./desktop-main-process.js";

/**
 * What a failing channel sends the window.
 *
 * Electron hands the renderer `error.toString()` behind the channel's name.
 * Reqraft's own errors are codes, not sentences: a configuration file that no
 * longer parses makes `loadUserConfig` throw `ReqraftError("config.invalid")`,
 * which a window would show as "ReqraftError: config.invalid". Every channel
 * words such an error before it leaves the main process. `credential:save`
 * also names the provider it was asked about: see `desktop-onboarding-ipc`.
 */

const t = createTranslator("en");
const SECRET = "sk-ant-not-a-real-key-5647382910";

/** What the window receives when `channel` fails with `sentence`. */
function asTheWindowSeesIt(channel: string, sentence: string): string {
  return `Error invoking remote method '${channel}': Error: ${sentence}`;
}

describe("a channel that reads a corrupted configuration", () => {
  // One channel per way `main/ipc.ts` registers handlers: the wording is
  // applied where they are registered, so a path that escaped it shows here.
  it.each([
    { channel: IPC_CHANNELS.configRead, payload: undefined },
    { channel: IPC_CHANNELS.onboardingState, payload: undefined },
    { channel: IPC_CHANNELS.providersStatus, payload: undefined },
    { channel: IPC_CHANNELS.providerDelete, payload: { id: "local" } },
    { channel: IPC_CHANNELS.credentialSave, payload: { provider: "anthropic", secret: SECRET } },
    { channel: IPC_CHANNELS.profileDelete, payload: { id: "team-style" } },
    { channel: IPC_CHANNELS.repromptStart, payload: { input: "Fix the title." } },
  ])("sends $channel the sentence, not the code", async ({ channel, payload }) => {
    const file = await corrompreLaConfiguration();
    const invoke = joindreProcessusPrincipal(dependancesSansTrousseau());

    await expect(invoke(channel, payload)).rejects.toHaveProperty(
      "message",
      asTheWindowSeesIt(channel, t("error.config.invalid", { path: file })),
    );
  });

  it("words it in the main process's language", async () => {
    const file = await corrompreLaConfiguration();
    const invoke = joindreProcessusPrincipal(dependancesSansTrousseau());
    setMainLocale("fr");
    try {
      await expect(invoke(IPC_CHANNELS.configRead)).rejects.toHaveProperty(
        "message",
        asTheWindowSeesIt(
          IPC_CHANNELS.configRead,
          createTranslator("fr")("error.config.invalid", { path: file }),
        ),
      );
    } finally {
      setMainLocale("en");
    }
  });
});

describe("a channel that fails for another reason", () => {
  it("words Reqraft's other codes the same way", async () => {
    await isolerLeDossierPersonnel();
    const invoke = joindreProcessusPrincipal(dependancesSansTrousseau());

    await expect(
      invoke(IPC_CHANNELS.profileDuplicate, { sourceId: "ghost", targetId: "ghost-copy" }),
    ).rejects.toHaveProperty(
      "message",
      asTheWindowSeesIt(
        IPC_CHANNELS.profileDuplicate,
        t("error.profile.unknown", { profile: "ghost" }),
      ),
    );
  });

  it("lets an error that is already a sentence through as it is", async () => {
    await isolerLeDossierPersonnel();
    const invoke = joindreProcessusPrincipal({
      ...dependancesSansTrousseau(),
      saveConfig: () => Promise.reject(new Error("The disk is full.")),
    });

    await expect(
      invoke(IPC_CHANNELS.configWrite, { defaultLevel: "complete" }),
    ).rejects.toHaveProperty(
      "message",
      asTheWindowSeesIt(IPC_CHANNELS.configWrite, "The disk is full."),
    );
  });
});
