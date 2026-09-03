import type { ProfileCatalogEntry, ProfileOriginId } from "@/apps/desktop/shared/ipc-contract.js";

/**
 * Reading a profile catalogue, for any surface that offers a choice.
 *
 * The popover picks a profile for one run and the onboarding picks the default
 * one; both have to search and group the same catalogue the same way, so the
 * rules live here rather than in whichever surface needed them first.
 */

/** Ignores case and accents: "rédaction" should match a search for "redaction". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Profiles matching a query, searched on everything the user can see. */
export function filterProfiles(
  entries: readonly ProfileCatalogEntry[],
  query: string,
): ProfileCatalogEntry[] {
  const needle = fold(query.trim());
  if (needle === "") return [...entries];
  return entries.filter((entry) =>
    [entry.id, entry.name, entry.description].some((field) => fold(field).includes(needle)),
  );
}

export interface ProfileGroup {
  origin: ProfileOriginId;
  labelKey: string;
  entries: ProfileCatalogEntry[];
}

/** Une clé, pas un libellé : le nom du groupe dépend de la langue. */
const GROUP_KEYS: Record<ProfileOriginId, string> = {
  auto: "picker.groupAuto",
  builtin: "picker.groupBuiltin",
  local: "picker.groupLocal",
};

/**
 * Groups by origin, in a fixed order.
 *
 * Someone looking for a profile they wrote should not have to read past the
 * built-ins that never change; empty groups are dropped so a filtered list
 * never shows a heading with nothing under it.
 */
export function groupProfiles(entries: readonly ProfileCatalogEntry[]): ProfileGroup[] {
  const order: ProfileOriginId[] = ["auto", "builtin", "local"];
  return order
    .map((origin) => ({
      origin,
      labelKey: GROUP_KEYS[origin],
      entries: entries.filter((entry) => entry.origin === origin),
    }))
    .filter((group) => group.entries.length > 0);
}
