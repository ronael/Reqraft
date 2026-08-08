export function shortModel(model: string): string {
  return model.length > 14 ? `${model.slice(0, 11)}…` : model;
}

export function wrapText(text: string, width: number): string[] {
  const safeWidth = Math.max(12, width);
  return text.split("\n").flatMap((line) => wrapLine(line, safeWidth));
}

export function actionLines(
  width: number,
  rows: number,
  status: string,
  shortcuts: readonly string[],
): string[] {
  const statusText = status === "streaming" ? "réception des tokens..." : "prêt";
  const items = [...shortcuts, statusText];
  const lines: string[] = [];
  let current = "";
  for (const item of items) {
    const candidate = current ? `${current}  ${item}` : item;
    if (candidate.length <= width) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = item.length > width ? item.slice(0, width) : item;
  }
  if (current) lines.push(current);

  const visible = lines.slice(0, rows);
  while (visible.length < rows) visible.push("");
  return visible.map((line) => line.padEnd(width, " "));
}

function wrapLine(line: string, width: number): string[] {
  if (!line) return [""];
  const chunks: string[] = [];
  let current = line;
  while (current.length > width) {
    const slice = current.slice(0, width + 1);
    const breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\t"));
    const end = breakAt > 8 ? breakAt : width;
    chunks.push(current.slice(0, end).trimEnd());
    current = current.slice(end).trimStart();
  }
  chunks.push(current);
  return chunks;
}
