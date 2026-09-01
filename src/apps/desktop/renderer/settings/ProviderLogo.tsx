import { Waypoints } from "lucide-react";
import type { CatalogProviderId } from "@/apps/desktop/shared/ipc-contract.js";

const PROVIDER_LOGOS: Partial<Record<CatalogProviderId, string>> = {
  anthropic: new URL("../assets/ai-brands/anthropic.svg", import.meta.url).href,
  openai: new URL("../assets/ai-brands/openai.svg", import.meta.url).href,
  deepseek: new URL("../assets/ai-brands/deepseek.svg", import.meta.url).href,
  mistral: new URL("../assets/ai-brands/mistralai.svg", import.meta.url).href,
};

export function ProviderLogo(
  props: Readonly<{ providerId: CatalogProviderId | "endpoint"; label: string }>,
): React.JSX.Element {
  const source = props.providerId === "endpoint" ? undefined : PROVIDER_LOGOS[props.providerId];
  const classes = [
    "provider-logo",
    `provider-logo-${props.providerId}`,
    props.providerId === "openai" ? "provider-logo-native-light" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={props.label} aria-hidden>
      {source === undefined ? (
        <Waypoints size={20} strokeWidth={1.7} />
      ) : (
        <img src={source} alt="" />
      )}
    </span>
  );
}
