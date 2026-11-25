import { parseArgs } from "node:util";

/**
 * How `rp edit` tells the interface to open on an agent's draft.
 *
 * Arguments rather than environment variables: a variable would pass on to
 * every program the user starts from that shell, and a stray one would turn a
 * plain `rp` into an edit session. Both sides read this one module, so the
 * spelling cannot drift. Values are joined with `=`: a path starting with a
 * dash still reads as a value.
 */
export interface AgentDraftArguments {
  file: string;
  profile?: string;
  level?: string;
}

const DRAFT = "agent-draft";

export function toAgentDraftArguments({ file, profile, level }: AgentDraftArguments): string[] {
  return [
    `--${DRAFT}=${file}`,
    ...(profile === undefined ? [] : [`--profile=${profile}`]),
    ...(level === undefined ? [] : [`--level=${level}`]),
  ];
}

/** The draft to open, or null for an ordinary `rp` session. */
export function readAgentDraftArguments(argv: readonly string[]): AgentDraftArguments | null {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      [DRAFT]: { type: "string" },
      profile: { type: "string" },
      level: { type: "string" },
    },
    strict: false,
    allowPositionals: true,
  });
  const file = values[DRAFT];
  if (typeof file !== "string" || file === "") return null;
  return {
    file,
    ...(typeof values.profile === "string" ? { profile: values.profile } : {}),
    ...(typeof values.level === "string" ? { level: values.level } : {}),
  };
}
