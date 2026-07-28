export interface ShellHandler {
  readonly name: string;
  readonly beginMarker: string;
  readonly endMarker: string;
  formatAlias(alias: string): string;
  parseExisting(content: string): { before: string; inside: string; after: string };
}
