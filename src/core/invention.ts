import { REPROMPT_POLICY } from "./reprompt-policy.js";

/**
 * Ce que la reformulation a fait apparaître et qui n'était pas dans la demande.
 *
 * Les chemins de fichiers et les commandes sont les inventions les plus
 * coûteuses d'un outil de reformulation : `src/auth/session.ts` ou
 * `pnpm run migrate` ont l'air d'un fait vérifié, et quelqu'un les exécutera.
 * À l'inverse d'une tournure ajoutée, elles se vérifient localement et sans
 * ambiguïté — le chemin est là, ou il n'y est pas.
 *
 * Le repérage est volontairement conservateur : mieux vaut manquer une
 * invention que crier au loup sur une demande honnête, sans quoi on apprend à
 * ignorer l'avertissement — et on perd aussi les vrais.
 */

const { fileExtensions, commandBinaries } = REPROMPT_POLICY.fidelity.invention;

/** Un segment de chemin : lettres, chiffres, et ce qu'un nom de fichier tolère. */
const PATH_SEGMENT = String.raw`[\w.@~-]+`;
const EXTENSIONS = fileExtensions.join("|");

function slashedPaths(): RegExp {
  return new RegExp(String.raw`${PATH_SEGMENT}(?:/${PATH_SEGMENT})+`, "g");
}

function filenames(): RegExp {
  return new RegExp(String.raw`\b[\w.@-]+\.(?:${EXTENSIONS})\b`, "gi");
}

/** Les URL sont des références, pas des fichiers du projet : on les retire d'abord. */
function withoutUrls(text: string): string {
  return text.replaceAll(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, " ");
}

/**
 * La ponctuation de fin ne fait pas partie du chemin.
 *
 * Un segment tolère le point — c'est ainsi qu'on reconnaît une extension — donc
 * « … dans src/auth/session.ts. » capturait le point final de la phrase et
 * signalait un chemin que personne n'a écrit.
 */
const TRAILING_PUNCTUATION = new Set(["!", ")", ",", ".", ":", ";", "?", "]", "}"]);

function trimPunctuation(candidate: string): string {
  // Une boucle plutôt qu'un `[...]+$` : la classe répétée en fin de motif
  // rétro-suit sur une longue série et coûte plus que ce qu'elle rend.
  let end = candidate.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(candidate[end - 1] ?? "")) end -= 1;
  return candidate.slice(0, end);
}

const TWO_LETTERS = /\p{L}{2}/u;
const KNOWN_EXTENSION = new RegExp(String.raw`\.(?:${EXTENSIONS})$`, "i");

/**
 * Ce qui distingue un chemin de deux mots séparés par un slash.
 *
 * Trois conditions, chacune posée par un faux positif rencontré : « et/ou » a
 * deux segments et aucun point ; « 12/03 » et « v1.2/1.3 » n'ont pas deux
 * lettres de suite ; « 3/4 » non plus. Ce qui reste — une extension connue,
 * une profondeur d'au moins trois, ou un segment porteur d'un point — désigne
 * bien un fichier ou un dossier.
 */
function looksLikePath(candidate: string): boolean {
  if (!TWO_LETTERS.test(candidate)) return false;

  const segments = candidate.split("/");
  return (
    KNOWN_EXTENSION.test(candidate) ||
    segments.length >= 3 ||
    segments.some((segment) => segment.includes("."))
  );
}

function collectPaths(text: string): Set<string> {
  const found = new Set<string>();
  let rest = withoutUrls(text);

  for (const match of rest.matchAll(slashedPaths())) {
    const candidate = trimPunctuation(match[0]);
    if (!looksLikePath(candidate)) continue;
    found.add(candidate.toLowerCase());
  }

  // Ce qui a déjà été reconnu comme chemin est retiré : sans cela
  // `src/auth/session.ts` serait aussi signalé sous `session.ts`, deux fois la
  // même invention.
  for (const path of found) {
    // Échappé : un chemin est du texte, pas une expression — un `.` y est un
    // point, et une parenthèse dans un nom de dossier ferait lever le RegExp.
    rest = rest
      .split(new RegExp(path.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`), "gi"))
      .join(" ");
  }

  for (const match of rest.matchAll(filenames())) {
    const candidate = trimPunctuation(match[0]);
    if (looksLikePath(candidate)) found.add(candidate.toLowerCase());
  }
  return found;
}

/**
 * Les chemins présents dans la sortie et absents de la demande.
 *
 * Comparés en minuscules : un chemin recopié avec une casse différente reste le
 * même chemin, et la casse n'est pas ce qu'on cherche à détecter.
 */
export function detectInventedPaths(input: string, output: string): string[] {
  const known = collectPaths(input);
  return [...collectPaths(output)]
    .filter((candidate) => !known.has(candidate))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Une commande : un programme connu suivi de son premier argument.
 *
 * `npm` seul ne dit rien — `npm run build` et `npm publish` ne se ressemblent
 * pas. La sous-commande fait donc partie de ce qu'on compare, sans quoi une
 * demande qui mentionne `git` autoriserait n'importe quel `git push --force`.
 */
function collectCommands(text: string): Set<string> {
  const found = new Set<string>();
  const words = text
    .toLowerCase()
    .split(/[^\w.@:/-]+/)
    .filter(Boolean);

  for (const [index, word] of words.entries()) {
    const argument = words[index + 1];
    const isKnownBinary = (commandBinaries as readonly string[]).includes(word);
    const hasRequiredContext =
      !isAmbiguousProse(word) || hasExplicitCommandContext(text, words, index, argument);
    if (isKnownBinary && hasRequiredContext) {
      found.add(argument === undefined ? word : `${word} ${argument}`);
    }
  }
  return found;
}

const AMBIGUOUS_PROSE_BINARIES = new Set(["go", "make"]);
const COMMAND_INTRODUCERS = new Set([
  "commande",
  "command",
  "execute",
  "exécute",
  "executer",
  "exécuter",
  "lance",
  "lancer",
  "run",
  "utilise",
  "use",
]);
const GO_SUBCOMMANDS = new Set([
  "build",
  "clean",
  "env",
  "fmt",
  "generate",
  "get",
  "install",
  "list",
  "mod",
  "run",
  "test",
  "tool",
  "version",
  "vet",
  "work",
]);

function isAmbiguousProse(word: string): boolean {
  return AMBIGUOUS_PROSE_BINARIES.has(word);
}

function hasExplicitCommandContext(
  text: string,
  words: readonly string[],
  index: number,
  argument: string | undefined,
): boolean {
  const word = words[index] ?? "";
  const previous = words[index - 1];
  if (previous !== undefined && COMMAND_INTRODUCERS.has(previous)) return true;
  if (word === "go" && argument !== undefined && GO_SUBCOMMANDS.has(argument)) return true;

  const escapedWord = word.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  const escapedArgument = (argument ?? "").replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
  const argumentPattern = escapedArgument === "" ? "" : String.raw`\s+` + escapedArgument;
  const command = escapedWord + argumentPattern;
  return (
    new RegExp(String.raw`(?:^|\n)\s*[$>#]\s*${command}(?:\s|$)`, "i").test(text) ||
    new RegExp("`[^`]*\\b" + command + "(?:\\s|`)", "i").test(text)
  );
}

export function detectInventedCommands(input: string, output: string): string[] {
  const known = collectCommands(input);
  return [...collectCommands(output)]
    .filter((candidate) => !known.has(candidate))
    .sort((a, b) => a.localeCompare(b));
}
