import { useState } from "react";
import { Button } from "../shared/Button.js";
import { InlineMessage } from "../shared/InlineMessage.js";
import { useT } from "../shared/i18n.js";
import { ipcFailureMessage } from "../shared/ipc-failure.js";
import { noticeText, type CapsuleNotice } from "./capsule-notice.js";

interface CapsuleNoticeViewProps {
  notice: CapsuleNotice | null;
  /** The pane is open: the capsule steps aside so it does not cover it. */
  onSettingsOpened(): void;
  /** The pane could not be opened; the message says so in words. */
  onOpenFailed(message: string): void;
}

/**
 * The notice under the capsule's text.
 *
 * A permission notice carries the button that opens the right pane of System
 * Settings. The renderer only names the permission: the main process holds
 * the address, so no string from here reaches `shell.openExternal`.
 */
export function CapsuleNoticeView({
  notice,
  onSettingsOpened,
  onOpenFailed,
}: Readonly<CapsuleNoticeViewProps>): React.JSX.Element | null {
  const t = useT();
  const [opening, setOpening] = useState(false);
  if (notice === null) return null;

  const { title, body } = noticeText(notice, t);
  if (notice.kind !== "permission") {
    if (body.length === 0) return null;
    return (
      <InlineMessage tone="info" className="capsule-notice">
        {body.join(" ")}
      </InlineMessage>
    );
  }

  const open = (): void => {
    setOpening(true);
    window.reqraft
      .openPermissionSettings(notice.pane)
      .then(onSettingsOpened)
      .catch((cause: unknown) => {
        onOpenFailed(ipcFailureMessage(cause));
      })
      .finally(() => {
        setOpening(false);
      });
  };

  return (
    <InlineMessage
      tone="warning"
      role="alert"
      className="capsule-notice"
      title={title}
      action={
        <Button variant="neutral" disabled={opening} aria-busy={opening} onClick={open}>
          {t("settings.remedy.openSystemSettings")}
        </Button>
      }
    >
      {body.join(" ")}
    </InlineMessage>
  );
}
