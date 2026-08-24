import { createRoot } from "react-dom/client";
import { PALETTE_VALUES } from "@/shared/palette-values.js";
import { App as CapsuleApp } from "./capsule/App.js";
import { PopoverApp } from "./popover/PopoverApp.js";
import { SettingsApp } from "./settings/SettingsApp.js";
import { OnboardingApp } from "./onboarding/OnboardingApp.js";
import "./shared/desktop.css";

/**
 * Renderer entry point. One bundle, three surfaces: the main process picks
 * through the `surface` query parameter (capsule by default, popover under
 * the tray icon, settings window, onboarding on a blank installation). Brand colours come from the single source
 * of truth, `ui/theme/palette-values.ts`, injected as CSS custom properties.
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

const surface = new URLSearchParams(window.location.search).get("surface");

function Surface(): React.JSX.Element {
  switch (surface) {
    case "popover":
      return <PopoverApp />;
    case "settings":
      return <SettingsApp />;
    case "onboarding":
      return <OnboardingApp />;
    default:
      return <CapsuleApp />;
  }
}

createRoot(rootElement).render(<Surface />);
