export interface SelectItem<T> {
  label: string;
  value: T;
  description?: string;
}

export interface SelectWindow<T> {
  /** The slice to render. */
  visible: SelectItem<T>[];
  /** Index of the highlighted item inside `visible`. */
  highlightedOffset: number;
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
}

/**
 * Case- and accent-insensitive match on the label and the description.
 *
 * Model identifiers are long and typed from memory, so matching on any part of
 * the entry beats matching on a prefix.
 */
export function filterItems<T>(items: SelectItem<T>[], query: string): SelectItem<T>[] {
  const needle = normalize(query);
  if (needle === "") {
    return items;
  }
  return items.filter((item) =>
    normalize(`${item.label} ${item.description ?? ""}`).includes(needle),
  );
}

/** Keeps the cursor inside the list, wrapping at both ends. */
export function moveIndex(index: number, delta: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return (((index + delta) % length) + length) % length;
}

/**
 * The slice to render, scrolled so the highlighted entry stays visible.
 *
 * Never assume every model fits on one screen.
 */
export function computeWindow<T>(
  items: SelectItem<T>[],
  highlighted: number,
  size: number,
): SelectWindow<T> {
  if (items.length <= size) {
    return {
      visible: items,
      highlightedOffset: highlighted,
      hasMoreAbove: false,
      hasMoreBelow: false,
    };
  }

  const maxOffset = items.length - size;
  const centred = highlighted - Math.floor(size / 2);
  const offset = Math.max(0, Math.min(centred, maxOffset));

  return {
    visible: items.slice(offset, offset + size),
    highlightedOffset: highlighted - offset,
    hasMoreAbove: offset > 0,
    hasMoreBelow: offset < maxOffset,
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
