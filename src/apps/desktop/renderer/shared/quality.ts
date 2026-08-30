import type { RepromptResult } from "@/apps/desktop/shared/ipc-contract.js";
import type { Translate } from "./i18n.js";

/**
 * Ce que la capsule dit d'un résultat, en une ligne.
 *
 * Fonction pure et à part : le verdict est la seule chose que quelqu'un lit
 * avant de remplacer son texte, et il doit être testable sans rendre la
 * capsule. « Aucune invention détectée » devant un `src/auth/session.ts` que
 * personne n'a écrit serait exactement le mensonge que ce verdict existe pour
 * empêcher.
 *
 * L'ordre est celui de ce qu'on peut vérifier : un chemin ou une commande se
 * montrent, une restructuration se constate. Le pied de la capsule tient une
 * ligne, donc on annonce la première trouvaille, pas un inventaire.
 */
export interface QualityFinding {
  /** Le mot du verdict : ce qui s'est passé. */
  label: string;
  /** La ligne en dessous : de quoi il s'agit précisément. */
  detail: string;
}

export function describeQualityFinding(
  signals: RepromptResult["quality"]["signals"],
  t: Translate,
): QualityFinding | null {
  const visible = signals.filter((signal) => signal.severity !== "info");
  // Par priorité, pas dans l'ordre du tableau : celui-ci suit l'ordre où les
  // détections tournent, qui n'a rien à voir avec ce qui aide le plus.
  const paths = visible.find((signal) => signal.code === "invented_paths");
  if (paths?.code === "invented_paths") {
    return {
      label: t("capsule.inventionDetected"),
      detail: t("capsule.inventedPaths", { list: paths.params.paths.join(", ") }),
    };
  }

  const commands = visible.find((signal) => signal.code === "invented_commands");
  if (commands?.code === "invented_commands") {
    return {
      label: t("capsule.inventionDetected"),
      detail: t("capsule.inventedCommands", { list: commands.params.commands.join(", ") }),
    };
  }

  const missingTerms = visible.find((signal) => signal.code === "missing_technical_terms");
  if (missingTerms?.code === "missing_technical_terms") {
    return {
      label: t("capsule.technicalTermsMissing"),
      detail: t("capsule.missingTechnicalTerms", { list: missingTerms.params.terms.join(", ") }),
    };
  }

  // Un autre mot : rien n'est « absent de votre demande » ici, la demande a
  // changé de forme. Reprendre le même verdict enverrait chercher une invention
  // qui n'existe pas.
  return visible.some((signal) => signal.code === "structural_inflation")
    ? { label: t("capsule.restructured"), detail: t("capsule.structuralInflation") }
    : null;
}
