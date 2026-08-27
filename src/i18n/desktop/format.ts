/** Remplace les `{placeholders}` par leurs valeurs. */
export function formatMessage(
  template: string,
  params: Readonly<Record<string, string>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

/** Signature du traducteur, partagée par les deux processus. */
export type Translate = (key: string, params?: Readonly<Record<string, string>>) => string;
