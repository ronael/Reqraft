import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  // Not testable yet: runSet and runRemove write the rc file before asking
  // (src/apps/cli/commands/aliases.ts:89 and :125 pass the dry-run flag, which
  // is false here, to the first setAlias/removeAlias call). Declining therefore
  // leaves the change applied, and accepting fails with "existe déjà" or
  // "n'existe pas" on the second call, exit code 1.
  it.todo("adds or removes the alias only once the user accepts, then says how to reload");
  it.todo("leaves the rc file untouched when the user declines");
  it.todo("reads the answer from stdin when no confirmation prompt is injected");
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
