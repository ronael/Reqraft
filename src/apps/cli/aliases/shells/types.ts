export interface ShellHandler {
  readonly name: string;
  readonly beginMarker: string;
  readonly endMarker: string;
  formatAlias(alias: string): string;
  /** The command that applies a changed config file to the running shell. */
  reloadCommand(configPath: string): string;
  parseExisting(content: string): { before: string; inside: string; after: string };
}
