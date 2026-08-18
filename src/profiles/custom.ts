import { z } from "zod";
import { DEFAULT_REPROMPT_LEVEL, RepromptLevelSchema } from "@/core/levels.js";
import { BUILTIN_PROFILE_IDS } from "./profile-ids.js";
import type { PromptProfile } from "./types.js";

const CustomProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  extends: z.enum(BUILTIN_PROFILE_IDS).optional(),
  defaultLevel: RepromptLevelSchema.default(DEFAULT_REPROMPT_LEVEL),
  instructions: z.string().optional(),
});

export function parseCustomProfile(source: string): PromptProfile {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);

  let metadata: Record<string, unknown>;
  let body = "";

  if (frontmatterMatch?.[1]) {
    metadata = parseSimpleFrontmatter(frontmatterMatch[1]);
    body = frontmatterMatch[2]?.trim() ?? "";
  } else {
    metadata = JSON.parse(source) as Record<string, unknown>;
  }

  const parsed = CustomProfileSchema.parse(metadata);

  return {
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    instructions: body !== "" ? body : (parsed.instructions ?? ""),
    defaultLevel: parsed.defaultLevel,
  };
}

function parseSimpleFrontmatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      result[key] = value.slice(1, -1);
    } else if (value === "true" || value === "false") {
      result[key] = value === "true";
    } else {
      result[key] = value;
    }
  }
  return result;
}
