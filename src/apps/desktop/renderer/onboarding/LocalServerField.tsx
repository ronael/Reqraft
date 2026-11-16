import { Loader2, RefreshCw } from "lucide-react";
import type { LocalModelAdvice } from "@/apps/desktop/shared/ipc-contract.js";
import { Button } from "../shared/Button.js";
import { useLocale, useT, type Translate } from "../shared/i18n.js";
import { InlineMessage } from "../shared/InlineMessage.js";
import { Select } from "../shared/Select.js";
import {
  runningServers,
  serverAt,
  type LocalAdvice,
  type LocalDetection,
} from "./local-servers.js";

/** Neither of the detected servers: the base URL field takes over. */
const OTHER_ADDRESS = "other";

/** "aucun modèle", "1 modèle", "3 modèles". */
export function modelCountLabel(count: number, t: Translate): string {
  if (count === 0) return t("onboarding.localModelsNone");
  if (count === 1) return t("onboarding.localModelsOne");
  return t("onboarding.localModelsMany", { count: String(count) });
}

interface LocalServerFieldProps {
  detection: LocalDetection;
  baseUrl: string;
  /** A detected server's address, or "" for an address of one's own. */
  onPick(baseUrl: string): void;
  onSearch(): void;
}

/**
 * Which local server to use: Ollama or LM Studio when they answer, or an
 * address of one's own.
 *
 * The search runs when the compatible provider is chosen; the button beside
 * the menu runs it again, which is what someone does after starting a server
 * or installing a model in another window. Picking a detected server hides the
 * address field — its address is shown here instead.
 */
export function LocalServerField({
  detection,
  baseUrl,
  onPick,
  onSearch,
}: Readonly<LocalServerFieldProps>): React.JSX.Element {
  const t = useT();
  const running = runningServers(detection);
  const current = serverAt(detection, baseUrl);
  const searching = detection.status === "idle" || detection.status === "searching";

  let detail: string;
  if (searching) detail = t("onboarding.localSearching");
  else if (current) detail = t("onboarding.localFoundAt", { baseUrl: current.baseUrl });
  else if (running.length > 0) detail = t("onboarding.localOtherAddress");
  else detail = t("onboarding.localNone");

  const searchAgain = t("onboarding.localSearchAgain");
  const searchButton = (
    <Button
      variant="neutral"
      disabled={searching}
      aria-busy={searching}
      aria-label={searchAgain}
      title={searchAgain}
      onClick={onSearch}
    >
      {searching ? (
        <Loader2 size={13} className="pulse" aria-hidden />
      ) : (
        <RefreshCw size={13} aria-hidden />
      )}
      {running.length === 0 && (searching ? t("onboarding.localSearchingShort") : searchAgain)}
    </Button>
  );

  return (
    <div className="onboarding-field">
      <span id="onboarding-server-label" className="onboarding-label">
        <span className="onboarding-label-title">{t("onboarding.localServer")}</span>
        <span className="onboarding-label-detail" aria-live="polite">
          {detail}
        </span>
      </span>
      {running.length > 0 ? (
        <span className="onboarding-server-control">
          <Select
            ariaLabelledBy="onboarding-server-label"
            value={current?.kind ?? OTHER_ADDRESS}
            options={[
              ...running.map((server) => ({
                value: server.kind,
                label: `${server.label} — ${modelCountLabel(server.models.length, t)}`,
              })),
              { value: OTHER_ADDRESS, label: t("onboarding.localOther") },
            ]}
            onChange={(value) => {
              onPick(running.find((server) => server.kind === value)?.baseUrl ?? "");
            }}
          />
          {searchButton}
        </span>
      ) : (
        searchButton
      )}
    </div>
  );
}

/** The decimal mark of the language being previewed: "3,3" in French, "3.3" in English. */
function formatGb(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 1 });
}

/**
 * What to install when there is no model to pick.
 *
 * The model is the one recommended for this machine's memory, with the exact
 * command for Ollama, or the name to search for in LM Studio, which has no
 * command. Selectable text rather than a copy button: the renderer has no
 * clipboard channel, by design.
 */
export function LocalModelAdviceNote({
  advice,
  recommendation,
}: Readonly<{ advice: LocalAdvice; recommendation: LocalModelAdvice }>): React.JSX.Element {
  const t = useT();
  const { locale } = useLocale();
  const language = locale ?? "en";
  const lead =
    advice.kind === "install"
      ? t("onboarding.localInstallLead")
      : t("onboarding.localNoModelLead", { server: advice.server });

  return (
    <div className="onboarding-field onboarding-field-stacked">
      <InlineMessage tone="info">
        {lead}{" "}
        {t("onboarding.localRecommendation", {
          model: recommendation.model,
          memoryGb: String(recommendation.memoryGb),
          size: `${formatGb(recommendation.sizeGb.min, language)}–${formatGb(recommendation.sizeGb.max, language)}`,
        })}{" "}
        {advice.kind === "search" ? (
          t("onboarding.localSearchIn", { searchTerm: recommendation.searchTerm })
        ) : (
          <>
            {t("onboarding.localPullIn")}
            <code className="onboarding-command">{recommendation.pullCommand}</code>
          </>
        )}
      </InlineMessage>
    </div>
  );
}
