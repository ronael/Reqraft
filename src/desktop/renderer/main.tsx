import { createRoot } from "react-dom/client";
import { PALETTE_VALUES } from "../../ui/theme/palette-values.js";
import { App } from "./capsule/App.js";
import "./shared/desktop.css";

/**
 * Renderer entry point. Brand colours come from the single source of truth,
 * `ui/theme/palette-values.ts`, injected as CSS custom properties; neutral
 * greys stay local to `desktop.css` until lot 3 defines shared tokens.
 */
const THEME_VARIABLES: Record<string, string> = {
  "--rq-accent": PALETTE_VALUES.accent,
  "--rq-accent-strong": PALETTE_VALUES.accentStrong,
  "--rq-success": PALETTE_VALUES.success,
  "--rq-warning": PALETTE_VALUES.warning,
  "--rq-danger": PALETTE_VALUES.danger,
};

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Élément #root introuvable dans le renderer.");
}

for (const [name, value] of Object.entries(THEME_VARIABLES)) {
  document.documentElement.style.setProperty(name, value);
}

createRoot(rootElement).render(<App />);
