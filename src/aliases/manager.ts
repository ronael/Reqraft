import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { ShellType } from "./detector.js";
import { bashHandler } from "./shells/bash.js";
import { fishHandler } from "./shells/fish.js";
import { powershellHandler } from "./shells/powershell.js";
import { zshHandler } from "./shells/zsh.js";

const HANDLERS: Record<Exclude<ShellType, "unknown">, typeof bashHandler> = {
  bash: bashHandler,
  zsh: zshHandler,
  fish: fishHandler,
  powershell: powershellHandler,
};

export interface AliasOperation {
  path: string;
  shell: string;
  added: string[];
  removed: string[];
  content: string;
}

export function validateAlias(name: string): void {
  if (!name || name.length === 0) {
    throw new Error("Le nom de l'alias ne peut pas être vide.");
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error("Le nom de l'alias contient des caractères invalides.");
  }
  if (["rp", "reprompt", "rm", "sudo", "cd"].includes(name)) {
    throw new Error(`Le nom '${name}' est réservé ou dangereux.`);
  }
}

export async function listAliases(configPath: string, shell: Exclude<ShellType, "unknown">): Promise<string[]> {
  const handler = HANDLERS[shell];
  if (!existsSync(configPath)) return [];
  const content = await readFile(configPath, "utf8");
  const { inside } = handler.parseExisting(content);
  return inside
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parseAliasLine(line, handler.name))
    .filter((name): name is string => name !== null);
}

export async function setAlias(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  alias: string,
  dryRun = false,
): Promise<AliasOperation> {
  validateAlias(alias);
  const handler = HANDLERS[shell];
  const existingContent = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const { before, inside, after } = handler.parseExisting(existingContent);

  const existingAliases = inside
    .split("\n")
    .map((line) => parseAliasLine(line, handler.name))
    .filter((name): name is string => name !== null);

  if (existingAliases.includes(alias)) {
    throw new Error(`L'alias '${alias}' existe déjà dans ${configPath}.`);
  }

  const newInside = [...existingAliases, alias].map((a) => handler.formatAlias(a)).join("\n");
  const newContent = `${before.trimEnd()}\n\n${handler.beginMarker}\n${newInside}\n${handler.endMarker}\n${after.trimStart()}`.trim();

  const operation: AliasOperation = {
    path: configPath,
    shell: handler.name,
    added: [alias],
    removed: [],
    content: newContent,
  };

  if (!dryRun) {
    await writeFile(configPath, newContent + "\n", "utf8");
  }

  return operation;
}

export async function removeAlias(
  configPath: string,
  shell: Exclude<ShellType, "unknown">,
  alias: string,
  dryRun = false,
): Promise<AliasOperation> {
  const handler = HANDLERS[shell];
  const existingContent = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  const { before, inside, after } = handler.parseExisting(existingContent);

  const existingAliases = inside
    .split("\n")
    .map((line) => parseAliasLine(line, handler.name))
    .filter((name): name is string => name !== null);

  if (!existingAliases.includes(alias)) {
    throw new Error(`L'alias '${alias}' n'existe pas dans ${configPath}.`);
  }

  const remainingAliases = existingAliases.filter((a) => a !== alias);

  let newContent: string;
  if (remainingAliases.length === 0) {
    newContent = `${before.trimEnd()}\n${after.trimStart()}`.trim();
  } else {
    const newInside = remainingAliases.map((a) => handler.formatAlias(a)).join("\n");
    newContent = `${before.trimEnd()}\n\n${handler.beginMarker}\n${newInside}\n${handler.endMarker}\n${after.trimStart()}`.trim();
  }

  const operation: AliasOperation = {
    path: configPath,
    shell: handler.name,
    added: [],
    removed: [alias],
    content: newContent,
  };

  if (!dryRun) {
    await writeFile(configPath, newContent + "\n", "utf8");
  }

  return operation;
}

function parseAliasLine(line: string, shellName: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (shellName === "Fish") {
    const match = /^alias\s+(\S+)\s+rp$/.exec(trimmed);
    return match?.[1] ?? null;
  }
  if (shellName === "PowerShell") {
    const match = /^Set-Alias\s+-Name\s+(\S+)\s+-Value\s+rp$/.exec(trimmed);
    return match?.[1] ?? null;
  }
  const match = /^alias\s+(\S+)="rp"$/.exec(trimmed);
  return match?.[1] ?? null;
}
