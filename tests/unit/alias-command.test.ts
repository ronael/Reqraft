import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { runAlias } from "@/apps/cli/commands/aliases.js";
import { EXIT_CODES } from "@/utils/exit-codes.js";

const BEGIN = "# >>> rp aliases >>>";
const END = "# <<< rp aliases <<<";

/** What the person wrote in their rc file themselves; rp must never touch it. */
const USER_LINES = 'export EDITOR="vim"\nalias ll="ls -la"';

function managedBlock(...lines: string[]): string {
  return [BEGIN, ...lines, END].join("\n");
}

interface CapturedOutput {
  output: { log(message: string): void; error(message: string): void };
  logs: string[];
  errors: string[];
}

function captureOutput(): CapturedOutput {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    output: {
      log(message: string): void {
        logs.push(message);
      },
      error(message: string): void {
        errors.push(message);
      },
    },
    logs,
    errors,
  };
}

let workDir: string;
let rcFile: string;
/** Every test that must not prompt checks this was never called. */
let confirm: Mock<(question: string) => Promise<string>>;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), "reqraft-alias-command-"));
  rcFile = path.join(workDir, ".bashrc");
  confirm = vi.fn<(question: string) => Promise<string>>();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await rm(workDir, { recursive: true, force: true });
});

describe("rp alias --dry-run", () => {
  it("previews an added alias next to the user's own lines without writing anything", async () => {
    const original = `${USER_LINES}\n`;
    await writeFile(rcFile, original, "utf8");
    const { output, logs, errors } = captureOutput();

    const code = await runAlias("set", "gpt", {
      shell: "bash",
      configPath: rcFile,
      dryRun: true,
      output,
      confirm,
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(logs).toEqual([
      "Alias à ajouter : gpt",
      "Shell : Bash",
      `Fichier : ${rcFile}`,
      "\n[--dry-run] Aucune modification appliquée.",
      "Contenu prévu :",
      `${USER_LINES}\n\n${managedBlock('alias gpt="rp"')}`,
    ]);
    expect(errors).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
  });

  it("previews a removal that keeps the other aliases without writing anything", async () => {
    const original = `${USER_LINES}\n\n${managedBlock('alias p="rp"', 'alias ask="rp"')}\n`;
    await writeFile(rcFile, original, "utf8");
    const { output, logs, errors } = captureOutput();

    const code = await runAlias("remove", "p", {
      shell: "bash",
      configPath: rcFile,
      dryRun: true,
      output,
      confirm,
    });

    expect(code).toBe(EXIT_CODES.SUCCESS);
    expect(logs).toEqual([
      "Alias à supprimer : p",
      "Shell : Bash",
      `Fichier : ${rcFile}`,
      "\n[--dry-run] Aucune modification appliquée.",
      "Contenu prévu :",
      `${USER_LINES}\n\n${managedBlock('alias ask="rp"')}`,
    ]);
    expect(errors).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
  });
});

describe("rp alias set|remove with confirmation", () => {
  /** Answers the confirmation, after noting what the rc file held while it was asked. */
  function answerWith(answer: string): () => string {
    let atQuestion = "";
    confirm.mockImplementation(async () => {
      atQuestion = await readFile(rcFile, "utf8");
      return answer;
    });
    return () => atQuestion;
  }

  it("adds or removes the alias only once the user accepts, then says how to reload", async () => {
    const original = `${USER_LINES}\n`;
    await writeFile(rcFile, original, "utf8");
    const withAlias = `${USER_LINES}\n\n${managedBlock('alias gpt="rp"')}\n`;

    const added = captureOutput();
    let contentAsked = answerWith("y");
    const setCode = await runAlias("set", "gpt", {
      shell: "bash",
      configPath: rcFile,
      output: added.output,
      confirm,
    });

    expect(setCode).toBe(EXIT_CODES.SUCCESS);
    expect(confirm).toHaveBeenLastCalledWith("Appliquer la modification ? (y/N) ");
    expect(contentAsked()).toBe(original);
    await expect(readFile(rcFile, "utf8")).resolves.toBe(withAlias);
    expect(added.logs.at(-1)).toBe(
      `Alias 'gpt' ajouté. Rechargez votre shell ou exécutez : source ${rcFile}`,
    );
    expect(added.errors).toEqual([]);

    const removed = captureOutput();
    contentAsked = answerWith("yes");
    const removeCode = await runAlias("remove", "gpt", {
      shell: "bash",
      configPath: rcFile,
      output: removed.output,
      confirm,
    });

    expect(removeCode).toBe(EXIT_CODES.SUCCESS);
    expect(confirm).toHaveBeenLastCalledWith("Confirmer la suppression ? (y/N) ");
    expect(contentAsked()).toBe(withAlias);
    await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
    expect(removed.logs.at(-1)).toBe(
      `Alias 'gpt' supprimé. Rechargez votre shell ou exécutez : source ${rcFile}`,
    );
    expect(removed.errors).toEqual([]);
  });

  it("tells PowerShell to dot-source the profile it changed, quoted", async () => {
    // PowerShell has no `source`. A Windows profile path often holds a space,
    // and a user name may hold a quote, which doubles inside single quotes.
    const profileDir = path.join(workDir, "O'Neil Documents");
    await mkdir(profileDir);
    const profile = path.join(profileDir, "Microsoft.PowerShell_profile.ps1");
    const reload = `. '${path.join(workDir, "O''Neil Documents", "Microsoft.PowerShell_profile.ps1")}'`;
    confirm.mockResolvedValue("y");

    const added = captureOutput();
    const setCode = await runAlias("set", "gpt", {
      shell: "powershell",
      configPath: profile,
      output: added.output,
      confirm,
    });
    const removed = captureOutput();
    const removeCode = await runAlias("remove", "gpt", {
      shell: "powershell",
      configPath: profile,
      output: removed.output,
      confirm,
    });

    expect([setCode, removeCode]).toEqual([EXIT_CODES.SUCCESS, EXIT_CODES.SUCCESS]);
    expect(added.logs.at(-1)).toBe(
      `Alias 'gpt' ajouté. Rechargez votre shell ou exécutez : ${reload}`,
    );
    expect(removed.logs.at(-1)).toBe(
      `Alias 'gpt' supprimé. Rechargez votre shell ou exécutez : ${reload}`,
    );
    expect([...added.errors, ...removed.errors]).toEqual([]);
  });

  it.each([
    { action: "set", name: "ask", answer: "n", message: "Modification annulée." },
    { action: "remove", name: "p", answer: "", message: "Suppression annulée." },
  ])(
    "leaves the rc file untouched when the user declines to $action an alias",
    async ({ action, name, answer, message }) => {
      const original = `${USER_LINES}\n\n${managedBlock('alias p="rp"')}\n`;
      await writeFile(rcFile, original, "utf8");
      confirm.mockResolvedValue(answer);
      const { output, logs, errors } = captureOutput();

      const code = await runAlias(action, name, {
        shell: "bash",
        configPath: rcFile,
        output,
        confirm,
      });

      expect(code).toBe(EXIT_CODES.SUCCESS);
      expect(confirm).toHaveBeenCalledOnce();
      expect(logs.at(-1)).toBe(message);
      expect(errors).toEqual([]);
      await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
    },
  );

  it.each([
    { stdin: "y\n", expected: `${managedBlock('alias gpt="rp"')}\n` },
    // Input that ends without an answer, such as a closed pipe, declines.
    { stdin: "", expected: undefined },
  ])(
    "reads the answer from stdin when no confirmation prompt is injected ($stdin)",
    async ({ stdin, expected }) => {
      const input = new PassThrough();
      input.end(stdin);
      vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as typeof process.stdin);
      let shown = "";
      const terminal = new Writable({
        write(chunk: Buffer, _encoding, done: () => void): void {
          shown += chunk.toString("utf8");
          done();
        },
      });
      vi.spyOn(process, "stdout", "get").mockReturnValue(
        terminal as unknown as typeof process.stdout,
      );
      const { output, errors } = captureOutput();

      const code = await runAlias("set", "gpt", { shell: "bash", configPath: rcFile, output });

      expect(code).toBe(EXIT_CODES.SUCCESS);
      expect(shown).toContain("Appliquer la modification ? (y/N) ");
      expect(errors).toEqual([]);
      if (expected === undefined) {
        await expect(readFile(rcFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      } else {
        await expect(readFile(rcFile, "utf8")).resolves.toBe(expected);
      }
    },
  );
});

describe("rp alias list", () => {
  it.each([
    { shell: "bash", file: ".bashrc", line: 'alias p="rp"' },
    { shell: "zsh", file: ".zshrc", line: 'alias p="rp"' },
    { shell: "fish", file: "config.fish", line: "alias p rp" },
    { shell: "powershell", file: "profile.ps1", line: "Set-Alias -Name p -Value rp" },
  ] as const)("reads aliases written in $shell syntax", async ({ shell, file, line }) => {
    const configPath = path.join(workDir, file);
    await writeFile(configPath, `${USER_LINES}\n\n${managedBlock(line)}\n`, "utf8");
    const { output, logs, errors } = captureOutput();

    await expect(runAlias("list", undefined, { shell, configPath, output })).resolves.toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(logs).toEqual(["p"]);
    expect(errors).toEqual([]);
  });

  it("lists only the aliases rp manages, one per line", async () => {
    await writeFile(
      rcFile,
      `${USER_LINES}\n\n${managedBlock('alias p="rp"', 'alias ask="rp"')}\n`,
      "utf8",
    );
    const { output, logs } = captureOutput();

    await runAlias("list", undefined, { shell: "bash", configPath: rcFile, output });

    expect(logs).toEqual(["p", "ask"]);
  });

  it("says so when no alias is configured yet", async () => {
    const { output, logs, errors } = captureOutput();

    await expect(
      runAlias("list", undefined, { shell: "bash", configPath: rcFile, output }),
    ).resolves.toBe(EXIT_CODES.SUCCESS);
    expect(logs).toEqual(["Aucun alias rp configuré."]);
    expect(errors).toEqual([]);
  });

  it("reports an rc path it cannot read", async () => {
    const { output, logs, errors } = captureOutput();

    await expect(
      runAlias("list", undefined, { shell: "bash", configPath: workDir, output }),
    ).resolves.toBe(EXIT_CODES.GENERAL_ERROR);
    expect(logs).toEqual([]);
    expect(errors).toEqual(["Erreur : Une erreur inattendue est survenue."]);
  });
});

describe("rp alias refusals", () => {
  it.each([
    { name: "a b", message: "Le nom d'alias « a b » contient des caractères invalides." },
    { name: "sudo", message: "Le nom d'alias « sudo » est réservé ou dangereux." },
  ])("refuses the alias name '$name' without writing anything", async ({ name, message }) => {
    const { output, logs, errors } = captureOutput();

    const code = await runAlias("set", name, {
      shell: "bash",
      configPath: rcFile,
      output,
      confirm,
    });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(errors).toEqual([`Erreur : ${message}`]);
    expect(logs).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(rcFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to add an alias that already exists", async () => {
    const original = `${managedBlock('alias p="rp"')}\n`;
    await writeFile(rcFile, original, "utf8");
    const { output, errors } = captureOutput();

    const code = await runAlias("set", "p", { shell: "bash", configPath: rcFile, output, confirm });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(errors).toEqual([`Erreur : L'alias « p » existe déjà dans ${rcFile}.`]);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
  });

  it("refuses to remove an alias that is not configured", async () => {
    const original = `${managedBlock('alias p="rp"')}\n`;
    await writeFile(rcFile, original, "utf8");
    const { output, errors } = captureOutput();

    const code = await runAlias("remove", "ask", {
      shell: "bash",
      configPath: rcFile,
      output,
      confirm,
    });

    expect(code).toBe(EXIT_CODES.GENERAL_ERROR);
    expect(errors).toEqual([`Erreur : L'alias « ask » n'existe pas dans ${rcFile}.`]);
    expect(confirm).not.toHaveBeenCalled();
    await expect(readFile(rcFile, "utf8")).resolves.toBe(original);
  });

  it.each([
    {
      call: "remove without a name",
      action: "remove",
      name: undefined,
      usage: "Usage : rp alias remove <nom>",
    },
    {
      call: "an unknown action",
      action: "rename",
      name: "p",
      usage: "Usage : rp alias set|remove|list [nom]",
    },
    {
      call: "no action at all",
      action: undefined,
      name: undefined,
      usage: "Usage : rp alias set|remove|list [nom]",
    },
  ])("prints the usage for $call", async ({ action, name, usage }) => {
    const { output, logs, errors } = captureOutput();

    const code = await runAlias(action, name, { shell: "bash", configPath: rcFile, output });

    expect(code).toBe(EXIT_CODES.INVALID_INPUT);
    expect(errors).toEqual([usage]);
    expect(logs).toEqual([]);
  });
});

describe("rp alias shell detection", () => {
  it("works on the rc file of the shell found in the environment", async () => {
    vi.stubEnv("SHELL", "/usr/bin/zsh");
    vi.stubEnv("HOME", workDir);
    await writeFile(path.join(workDir, ".zshrc"), `${managedBlock('alias p="rp"')}\n`, "utf8");
    const listing = captureOutput();
    const preview = captureOutput();

    await runAlias("list", undefined, { output: listing.output });
    await runAlias("set", "ask", { dryRun: true, output: preview.output });

    expect(listing.logs).toEqual(["p"]);
    expect(preview.logs).toContain("Shell : Zsh");
  });

  it("stops when the environment names no supported shell", async () => {
    vi.stubEnv("SHELL", undefined);
    vi.stubEnv("PSModulePath", undefined);
    vi.stubEnv("ComSpec", undefined);
    const { output, logs, errors } = captureOutput();

    await expect(runAlias("list", undefined, { output })).resolves.toBe(
      EXIT_CODES.INVALID_CONFIGURATION,
    );
    expect(errors).toEqual(["Shell non reconnu. Shells supportés : Bash, Zsh, Fish, PowerShell."]);
    expect(logs).toEqual([]);
  });

  it("stops when no rc file can be determined for the shell", async () => {
    const { output, logs, errors } = captureOutput();

    await expect(
      runAlias("list", undefined, { shell: "bash", configPath: "", output }),
    ).resolves.toBe(EXIT_CODES.INVALID_CONFIGURATION);
    expect(errors).toEqual(["Impossible de déterminer le fichier de configuration du shell."]);
    expect(logs).toEqual([]);
  });
});
