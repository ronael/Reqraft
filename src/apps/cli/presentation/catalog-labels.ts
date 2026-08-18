import type { Translator } from "@/i18n/translate.js";

const PROFILE_DESCRIPTION_KEYS = {
  clean: "profile.clean.description",
  code: "profile.code.description",
  debug: "profile.debug.description",
  frontend: "profile.frontend.description",
  review: "profile.review.description",
  "web-design": "profile.web-design.description",
  writing: "profile.writing.description",
} as const;

const MODEL_DESCRIPTION_KEYS = {
  "gpt-4.1-mini": "model.gpt-4.1-mini.description",
  "gpt-5-mini": "model.gpt-5-mini.description",
  "gpt-5-nano": "model.gpt-5-nano.description",
  "gpt-5.1": "model.gpt-5.1.description",
  "claude-haiku-4-5": "model.claude-haiku-4-5.description",
  "claude-sonnet-5": "model.claude-sonnet-5.description",
  "deepseek-v4-flash": "model.deepseek-v4-flash.description",
  "deepseek-v4-pro": "model.deepseek-v4-pro.description",
  "mistral-small-2603": "model.mistral-small-2603.description",
} as const;

export function profileDescription(id: string, fallback: string, t: Translator): string {
  if (!(id in PROFILE_DESCRIPTION_KEYS)) return fallback;
  return t(PROFILE_DESCRIPTION_KEYS[id as keyof typeof PROFILE_DESCRIPTION_KEYS]);
}

export function modelDescription(id: string, fallback: string, t: Translator): string {
  if (!(id in MODEL_DESCRIPTION_KEYS)) return fallback;
  return t(MODEL_DESCRIPTION_KEYS[id as keyof typeof MODEL_DESCRIPTION_KEYS]);
}
