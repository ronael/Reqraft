import { describe, expect, it } from "vitest";
import {
  fallbackEditor,
  forTerminal,
  isAgentDraft,
  runEdit,
  type EditDependencies,
} from "@/apps/cli/commands/edit.js";
import type { Key } from "@/apps/cli/commands/keys.js";
import { createTranslator } from "@/i18n/translate.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const t = createTranslator("fr");
const FILE = "/Users/ada/.codex/.tmpDRAFT.md";
const DRAFT = "jveux que tu regarde pk le bouton marche pas";
const REWRITTEN = "Trouve pourquoi le bouton ne réagit pas, puis corrige-le.";

function setup(options: {
  app?: { result: "kept"; text: string } | { result: "cancelled" } | { result: "busy" };
  interactive?: boolean;
  keys?: Key[];
  results?: { code: number; text: string }[];
  draft?: string;
  /** The full interface: its exit code, and what it sent back, if anything. */
  ui?: { code: number; sends?: string };
}) {
  const files: Record<string, string> = { [FILE]: options.draft ?? DRAFT };
  const keys = [...(options.keys ?? [])];
  const results = [...(options.results ?? [{ code: 0, text: REWRITTEN }])];
  const screen: string[] = [];
  let rewrites = 0;
  const opened: string[] = [];
  const interfaces: { file: string; options: unknown }[] = [];
  const deps: EditDependencies = {
    readText: (file) => Promise.resolve(files[file] ?? ""),
    writeText: (file, text) => {
      files[file] = text;
      return Promise.resolve();
    },
    rewrite: () => {
      rewrites += 1;
      return Promise.resolve(results.shift() ?? { code: 0, text: REWRITTEN });
    },
    screen: { write: (text) => screen.push(text) },
    interactive: options.interactive ?? true,
    color: false,
    readKey: () => Promise.resolve(keys.shift() ?? "escape"),
    openInEditor: (file) => {
      opened.push(file);
      return 0;
    },
    reviewInApp: (_draft, onConnected) => {
      if (options.app === undefined) return Promise.resolve({ result: "unavailable" as const });
      onConnected();
      return Promise.resolve(options.app);
    },
    reviewInInterface: (file, editOptions) => {
      if (options.ui === undefined) return null;
      interfaces.push({ file, options: editOptions });
      if (options.ui.sends !== undefined) files[file] = options.ui.sends;
      return options.ui.code;
    },
  };
  return { deps, files, screen, opened, interfaces, rewrites: () => rewrites };
}

describe("rp edit, l'éditeur que l'agent ouvre", () => {
  it("garde la réécriture sur Entrée, après avoir montré avant et après", async () => {
    const { deps, files, screen } = setup({ keys: ["enter"] });
    expect(await runEdit(FILE, {}, t, deps)).toBe(EXIT_CODES.SUCCESS);
    expect(files[FILE]).toBe(REWRITTEN);
    const shown = screen.join("");
    expect(shown).toContain("AVANT");
    expect(shown).toContain("APRÈS");
    expect(shown).toContain(REWRITTEN);
  });

  it("rend le brouillon intact sur Échap, sans faire échouer l'agent", async () => {
    const { deps, files } = setup({ keys: ["escape"] });
    expect(await runEdit(FILE, {}, t, deps)).toBe(EXIT_CODES.SUCCESS);
    expect(files[FILE]).toBe(DRAFT);
  });

  it("relance sur r, puis garde la deuxième version", async () => {
    const { deps, files, rewrites } = setup({
      keys: [{ char: "r" }, "enter"],
      results: [
        { code: 0, text: "première" },
        { code: 0, text: "seconde" },
      ],
    });
    await runEdit(FILE, {}, t, deps);
    expect(rewrites()).toBe(2);
    expect(files[FILE]).toBe("seconde");
  });

  it("sans terminal, ou avec --yes, remplace directement", async () => {
    const piped = setup({ interactive: false });
    expect(await runEdit(FILE, {}, t, piped.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(piped.files[FILE]).toBe(REWRITTEN);

    const yes = setup({});
    await runEdit(FILE, { yes: true }, t, yes.deps);
    expect(yes.files[FILE]).toBe(REWRITTEN);
  });

  it("quand la réécriture échoue, laisse lire l'erreur et rend le brouillon", async () => {
    const failing = setup({
      keys: ["enter"],
      results: [{ code: EXIT_CODES.AUTHENTICATION, text: "" }],
    });
    expect(await runEdit(FILE, {}, t, failing.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(failing.files[FILE]).toBe(DRAFT);
    expect(failing.screen.join("")).toContain("Entrée pour revenir à votre brouillon");

    const piped = setup({
      interactive: false,
      results: [{ code: EXIT_CODES.AUTHENTICATION, text: "" }],
    });
    expect(await runEdit(FILE, {}, t, piped.deps)).toBe(EXIT_CODES.AUTHENTICATION);
  });

  it("ne réécrit pas un brouillon vide", async () => {
    const { deps, rewrites } = setup({ interactive: false, draft: "  \n" });
    expect(await runEdit(FILE, {}, t, deps)).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(rewrites()).toBe(0);
  });

  it("ne réécrit qu'un brouillon Markdown, et passe le reste à l'éditeur de la personne", async () => {
    expect(isAgentDraft("/Users/ada/.codex/.tmp8Kx3Z1.md")).toBe(true);
    expect(isAgentDraft("/var/folders/x/gemini-edit-a1/buffer.txt")).toBe(true);
    expect(isAgentDraft("/repo/.git/COMMIT_EDITMSG")).toBe(false);
    expect(isAgentDraft("/repo/.git/notes.md")).toBe(false);
    expect(isAgentDraft("/Users/ada/crontab.Xyz")).toBe(false);

    const commit = setup({});
    expect(await runEdit("/repo/.git/COMMIT_EDITMSG", {}, t, commit.deps)).toBe(0);
    expect(commit.opened).toEqual(["/repo/.git/COMMIT_EDITMSG"]);
    expect(commit.rewrites()).toBe(0);
  });

  it("prend EDITOR comme éditeur de repli, sauf s'il désigne Reqraft", () => {
    expect(fallbackEditor({ EDITOR: "nvim" }, "darwin")).toBe("nvim");
    expect(fallbackEditor({ EDITOR: "rp edit" }, "darwin")).toBe("vi");
    expect(fallbackEditor({}, "win32")).toBe("notepad");
  });

  it("avec l'app ouverte, la capsule relit : gardé, écrit ; fermé, intact", async () => {
    const kept = setup({ app: { result: "kept", text: "depuis la capsule" } });
    expect(await runEdit(FILE, {}, t, kept.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(kept.files[FILE]).toBe("depuis la capsule");
    expect(kept.rewrites()).toBe(0);
    expect(kept.screen.join("")).toContain("Relecture dans l'app Reqraft");

    const closed = setup({ app: { result: "cancelled" } });
    expect(await runEdit(FILE, {}, t, closed.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(closed.files[FILE]).toBe(DRAFT);
    expect(closed.rewrites()).toBe(0);
  });

  it("si l'app est occupée, relit dans le terminal", async () => {
    const busy = setup({ app: { result: "busy" }, keys: ["enter"] });
    await runEdit(FILE, {}, t, busy.deps);
    expect(busy.rewrites()).toBe(1);
    expect(busy.files[FILE]).toBe(REWRITTEN);
  });

  it("sans l'app, ouvre l'interface complète, qui renvoie elle-même le résultat", async () => {
    const used = setup({ ui: { code: 0, sends: REWRITTEN } });
    expect(await runEdit(FILE, { profile: "dev" }, t, used.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(used.files[FILE]).toBe(REWRITTEN);
    expect(used.interfaces).toEqual([{ file: FILE, options: { profile: "dev" } }]);
    expect(used.rewrites()).toBe(0);

    const left = setup({ ui: { code: 0 } });
    expect(await runEdit(FILE, {}, t, left.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(left.files[FILE]).toBe(DRAFT);
    expect(left.rewrites()).toBe(0);
  });

  it("l'app passe avant l'interface, et --yes n'ouvre ni l'une ni l'autre", async () => {
    const inApp = setup({ app: { result: "kept", text: "capsule" }, ui: { code: 0 } });
    await runEdit(FILE, {}, t, inApp.deps);
    expect(inApp.interfaces).toEqual([]);

    const direct = setup({ ui: { code: 0 } });
    await runEdit(FILE, { yes: true }, t, direct.deps);
    expect(direct.interfaces).toEqual([]);
    expect(direct.files[FILE]).toBe(REWRITTEN);
  });

  it("si l'interface échoue sans rien renvoyer, la relecture courte prend le relais", async () => {
    const failed = setup({ ui: { code: 1 }, keys: ["enter"] });
    expect(await runEdit(FILE, {}, t, failed.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(failed.rewrites()).toBe(1);
    expect(failed.files[FILE]).toBe(REWRITTEN);

    // Already sent back before failing: nothing to review again.
    const sent = setup({ ui: { code: 1, sends: "déjà renvoyé" } });
    expect(await runEdit(FILE, {}, t, sent.deps)).toBe(EXIT_CODES.SUCCESS);
    expect(sent.rewrites()).toBe(0);
    expect(sent.files[FILE]).toBe("déjà renvoyé");
  });

  it("revient au début de ligne même dans un terminal laissé en mode brut", () => {
    expect(forTerminal("AVANT\nligne un\r\nAPRÈS\n")).toBe("AVANT\r\nligne un\r\nAPRÈS\r\n");
  });
});
