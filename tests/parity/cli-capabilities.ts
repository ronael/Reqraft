import type { Command } from "commander";
import { CAPABILITIES } from "@/capabilities/registry.js";

/**
 * Options déclarées à Commander qui ne sont pas des capacités produit :
 * pilotage de l'exécution, entrées alternatives ou métadonnées du binaire.
 * Classer ici une option qui est une capacité produit contournerait le
 * registre — préférer une entrée dans `CAPABILITIES`.
 */
const NON_CAPABILITY_OPTIONS = new Set([
  "--clipboard",
  "--file",
  "--fidelity",
  "--no-stream",
  "--timeout",
  "--max-output-tokens",
  "--verbose",
  "--force",
  "--ui-locale",
  "--output-language",
  "--help",
  "--version",
]);

function declaredLongFlags(program: Command): Set<string> {
  return new Set(
    program.options
      .map((option) => option.long)
      .filter((flag): flag is string => flag !== undefined),
  );
}

/**
 * Inventaire des capacités exposées par le CLI, dérivé des options
 * réellement déclarées à Commander sur la commande racine — pas d'une liste
 * recopiée. `reformulate` n'a pas de flag : il est exposé par l'argument
 * `[text]` et l'action par défaut de la commande racine.
 */
export function listCliCapabilities(program: Command): string[] {
  const flags = declaredLongFlags(program);
  const exposesDefaultAction = program.registeredArguments.length > 0;
  return CAPABILITIES.filter((capability) => {
    if (!capability.surfaces.includes("cli")) return false;
    if (capability.cliFlag === undefined) return exposesDefaultAction;
    return flags.has(capability.cliFlag);
  }).map((capability) => capability.id);
}

/**
 * Options déclarées à Commander qui ne correspondent ni à une capacité du
 * registre ni à une option de pilotage connue. Tout élément retourné est une
 * dérive : une option exposée sans déclaration dans le registre.
 */
export function listUnregisteredCliOptions(program: Command): string[] {
  const capabilityFlags = new Set(
    CAPABILITIES.map((capability) => capability.cliFlag).filter(
      (flag): flag is string => flag !== undefined,
    ),
  );
  return [...declaredLongFlags(program)].filter(
    (flag) => !capabilityFlags.has(flag) && !NON_CAPABILITY_OPTIONS.has(flag),
  );
}
