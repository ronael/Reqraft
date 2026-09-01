import { CircleAlert, CircleCheck, ExternalLink, RefreshCw } from "lucide-react";
import type { DesktopUpdateState } from "@/apps/desktop/shared/ipc-contract.js";
import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";

export interface UpdatesTabProps {
  state: DesktopUpdateState | null;
  onCheck(): void;
  onOpenDownload(): void;
}

export function UpdatesTab(props: Readonly<UpdatesTabProps>): React.JSX.Element {
  const t = useT();
  const checking = props.state?.status === "checking";
  const available = props.state?.status === "available";

  return (
    <>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">{t("settings.updates.current")}</div>
          <div className="settings-row-detail">{t("settings.updates.currentDetail")}</div>
        </div>
        <strong className="mono">{props.state?.currentVersion ?? "—"}</strong>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-title">{t("settings.updates.latest")}</div>
          <div className="settings-row-detail">{statusLabel(props.state, t)}</div>
        </div>
        <strong className="mono">{props.state?.latestVersion ?? "—"}</strong>
      </div>

      {available && (
        <div className="settings-warning settings-update-available" role="status">
          <CircleCheck size={14} aria-hidden />
          <span>
            {t("settings.updates.available", { version: props.state.latestVersion ?? "" })}
          </span>
        </div>
      )}
      {props.state?.status === "error" && (
        <div className="settings-warning" role="alert">
          <CircleAlert size={14} aria-hidden /> {t("settings.updates.error")}
        </div>
      )}

      <div className="settings-actions">
        <Button variant="neutral" disabled={checking} onClick={props.onCheck}>
          <RefreshCw size={13} className={checking ? "pulse" : undefined} aria-hidden />
          {checking ? t("settings.updates.checking") : t("settings.updates.check")}
        </Button>
        {available && (
          <Button onClick={props.onOpenDownload}>
            <ExternalLink size={13} aria-hidden /> {t("settings.updates.download")}
          </Button>
        )}
      </div>
      <p className="settings-note muted">{t("settings.updates.startupNote")}</p>
    </>
  );
}

function statusLabel(state: DesktopUpdateState | null, t: Translate): string {
  if (state === null || state.status === "idle") return t("settings.updates.notChecked");
  if (state.status === "checking") return t("settings.updates.checking");
  if (state.status === "available") return t("settings.updates.availableShort");
  if (state.status === "up-to-date") return t("settings.updates.upToDate");
  return t("settings.updates.errorShort");
}
