import { CloudDownload, ExternalLink, Package, RefreshCw } from "lucide-react";
import type { DesktopUpdateState } from "@/apps/desktop/shared/ipc-contract.js";
import { useT, type Translate } from "../shared/i18n.js";
import { Button } from "../shared/Button.js";
import { InlineMessage, type MessageTone } from "../shared/InlineMessage.js";

export interface UpdatesTabProps {
  state: DesktopUpdateState | null;
  onCheck(): void;
  onOpenDownload(): void;
}

export function describeUpdateState(state: DesktopUpdateState | null, t: Translate): string {
  if (state === null || state.status === "idle") return t("settings.updates.notChecked");
  if (state.status === "checking") return t("settings.updates.checking");
  if (state.status === "available") {
    return t("settings.updates.available", { version: state.latestVersion ?? "" });
  }
  if (state.status === "up-to-date") return t("settings.updates.upToDate");
  return t("settings.updates.error");
}

export function updateStateTone(state: DesktopUpdateState | null): MessageTone {
  if (state === null || state.status === "idle") return "info";
  if (state.status === "checking") return "pending";
  if (state.status === "up-to-date") return "success";
  if (state.status === "error") return "error";
  return "info";
}

export function UpdatesTab(props: Readonly<UpdatesTabProps>): React.JSX.Element {
  const t = useT();
  const checking = props.state?.status === "checking";
  const available = props.state?.status === "available";
  const failed = props.state?.status === "error";

  return (
    <>
      <section className="settings-section">
        <div className="settings-section-head">
          <h3 className="settings-subhead">{t("settings.updates.versionGroup")}</h3>
        </div>
        <div className="settings-group">
          <div className="settings-group-rows">
            <div className="settings-group-row">
              <span className="settings-row-icon">
                <Package size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.updates.current")}</span>
                <span className="settings-row-detail">{t("settings.updates.currentDetail")}</span>
              </span>
              <span className="settings-row-control">
                <span className="settings-state mono">{props.state?.currentVersion ?? "—"}</span>
              </span>
            </div>
            <div className="settings-group-row">
              <span className="settings-row-icon">
                <CloudDownload size={18} strokeWidth={1.7} aria-hidden />
              </span>
              <span className="settings-group-copy">
                <span className="settings-row-title">{t("settings.updates.latest")}</span>
                <span className="settings-row-detail">{t("settings.updates.latestDetail")}</span>
              </span>
              <span className="settings-row-control">
                <span className="settings-state mono">{props.state?.latestVersion ?? "—"}</span>
              </span>
            </div>
          </div>

          <div className="settings-group-foot settings-group-foot-split">
            <InlineMessage tone={updateStateTone(props.state)} role={failed ? "alert" : "status"}>
              {describeUpdateState(props.state, t)}
            </InlineMessage>
            <div className="settings-actions">
              <Button
                variant="neutral"
                disabled={checking}
                aria-busy={checking}
                onClick={props.onCheck}
              >
                <RefreshCw size={13} className={checking ? "spin" : undefined} aria-hidden />
                {t("settings.updates.check")}
              </Button>
              {available && (
                <Button className="settings-action-entering" onClick={props.onOpenDownload}>
                  <ExternalLink size={13} aria-hidden /> {t("settings.updates.download")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="settings-note muted">{t("settings.updates.startupNote")}</p>
    </>
  );
}
