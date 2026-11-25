import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDesktopAgents,
  unseenAnnouncements,
  withAnnouncementSeen,
} from "@/apps/desktop/main/agents.js";
import type { Config } from "@/config/schema.js";

/**
 * Réglages › Agents IA côté processus principal, sur un vrai disque : un
 * dossier personnel temporaire et un PATH qui ne contient que de faux agents.
 */

let home: string;

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function fakeExecutable(directory: string, name: string): Promise<void> {
  const file = path.join(directory, name);
  await writeFile(file, "#!/bin/sh\necho 0.7.0\n", "utf8");
  await chmod(file, 0o755);
}

async function setup(installed: string[]) {
  home = await mkdtemp(path.join(os.tmpdir(), "rq-agents-"));
  const bin = path.join(home, "bin");
  await mkdir(bin);
  for (const name of installed) await fakeExecutable(bin, name);
  await writeFile(path.join(home, ".zshrc"), "export PATH=x\n", "utf8");
  const copied: string[] = [];
  const review = { on: true };
  const agents = createDesktopAgents({
    env: { SHELL: "/bin/zsh" },
    platform: "darwin",
    home,
    locale: () => "fr",
    writeClipboard: (text) => copied.push(text),
    searchPath: () => Promise.resolve(bin),
    cliVersion: () => Promise.resolve("0.7.0"),
    reviewInApp: () => Promise.resolve(review.on),
    setReviewInApp: (enabled) => {
      review.on = enabled;
      return Promise.resolve();
    },
  });
  return { agents, copied, zshrc: path.join(home, ".zshrc") };
}

describe("les agents vus de l'application", () => {
  it("trouve rp et les agents par le PATH du shell, et les présente avec ~", async () => {
    const { agents } = await setup(["rp", "codex"]);
    const state = await agents.state();
    expect(state.cli).toEqual({ installed: true, version: "0.7.0", path: "~/bin/rp" });
    expect(state.shell).toEqual({ name: "zsh", file: "~/.zshrc" });
    const codex = state.agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({ path: "~/bin/codex", enabled: false, supported: true });
    expect(codex?.line).toBe('codex() { VISUAL="rp edit" command codex "$@"; }');
    expect(state.agentPrompt).toContain("rp agents --enable --yes");
  });

  it("sans rp, donne la commande d'installation", async () => {
    const { agents } = await setup(["codex"]);
    expect((await agents.state()).cli).toEqual({
      installed: false,
      installCommand: "npm install -g @reqraft/cli",
    });
  });

  it("active puis désactive dans le vrai fichier, sans toucher au reste", async () => {
    const { agents, zshrc } = await setup(["rp", "codex"]);
    const enabled = await agents.setEnabled("codex", true);
    expect(enabled.agents.find((agent) => agent.id === "codex")?.enabled).toBe(true);
    expect(await readFile(zshrc, "utf8")).toContain("# >>> reqraft agents >>>");
    await agents.setEnabled("codex", false);
    expect(await readFile(zshrc, "utf8")).toBe("export PATH=x\n");
  });

  it("copie ce qu'on lui nomme, et rien d'autre", async () => {
    const { agents, copied } = await setup(["rp", "codex"]);
    await agents.copy({ what: "install" });
    await agents.copy({ what: "prompt" });
    await agents.copy({ what: "line", id: "codex" });
    expect(copied[0]).toBe("npm install -g @reqraft/cli");
    expect(copied[1]).toContain("rp agents --enable --yes");
    expect(copied[2]).toBe('codex() { VISUAL="rp edit" command codex "$@"; }');
    await expect(agents.copy({ what: "line", id: "inconnu" })).rejects.toMatchObject({
      errorCode: "agents.unknown",
    });
  });
});

describe("les annonces", () => {
  it("ne montrent chaque nouveauté qu'une fois", () => {
    const fresh = {} as Config;
    expect(unseenAnnouncements(fresh)).toEqual(["agents"]);
    const seen = withAnnouncementSeen(fresh, "agents");
    expect(unseenAnnouncements(seen)).toEqual([]);
    expect(withAnnouncementSeen(seen, "agents").desktopAnnouncementsSeen).toEqual(["agents"]);
  });
});
