import process from "node:process";
import { detectCapabilities } from "@/shared/terminal/capabilities.js";
import { createComponentTokens, type ComponentTokens } from "./components.js";
import { createTokens, type Tokens } from "./tokens.js";

export type { ColorTokens, SpacingTokens, BorderTokens, LayoutTokens, Tokens } from "./tokens.js";
export type { ComponentTokens, SurfaceTone, Density } from "./components.js";
export { toneBorderColor, toneTextColor } from "./components.js";
export { createTokens } from "./tokens.js";

export interface Theme {
  tokens: Tokens;
  components: ComponentTokens;
}

export function createTheme(
  capabilities = detectCapabilities(process.env, process.stdout.isTTY, process.platform),
): Theme {
  const tokens = createTokens(capabilities);
  return { tokens, components: createComponentTokens(tokens) };
}

/**
 * Theme for the running terminal, resolved once: capabilities cannot change
 * mid-session, and a stable object keeps React from re-rendering on identity.
 * Tests build their own with `createTheme(...)` rather than reading this.
 */
export const theme: Theme = createTheme();
