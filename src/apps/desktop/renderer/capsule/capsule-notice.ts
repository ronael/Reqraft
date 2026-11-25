import type {
  CaptureSelectionResponse,
  SystemPermissionPane,
} from "@/apps/desktop/shared/ipc-contract.js";
import type { DesktopMessageKey } from "@/i18n/desktop/index.js";
import type { Translate } from "../shared/i18n.js";

/**
 * What the capsule says under its text when something did not go as asked.
 *
 * An empty capture says why, and whether the field holds the copied text
 * instead. A macOS permission behind it, at the capture or at the
 * replacement, is a notice of its own: what macOS blocked, what to allow, and
 * a button that opens that pane, rather than a path to retrace by hand.
 */
export type CapsuleNotice =
  | { kind: "capture"; reason: string | null; clipboardSuggested: boolean }
  | {
      kind: "permission";
      pane: SystemPermissionPane;
      /** What the permission stopped: reading the selection, or pasting the result. */
      blocked: "capture" | "replace";
      clipboardSuggested: boolean;
    };

type EmptyCapture = Extract<CaptureSelectionResponse, { empty: true }>;

/**
 * The notice of an empty capture. The copied text, when there is some, fills
 * the field: it is the fallback when the shortcut caught nothing, and it is
 * only sent on the user's ⌘⏎.
 */
export function emptyCaptureNotice(capture: EmptyCapture): CapsuleNotice {
  const clipboardSuggested = capture.clipboardText !== undefined;
  if (capture.permission !== undefined) {
    return { kind: "permission", pane: capture.permission, blocked: "capture", clipboardSuggested };
  }
  return { kind: "capture", reason: capture.reason ?? null, clipboardSuggested };
}

/** A replacement macOS refused: the result was copied instead. */
export function replaceBlockedNotice(pane: SystemPermissionPane): CapsuleNotice {
  return { kind: "permission", pane, blocked: "replace", clipboardSuggested: false };
}

/**
 * What the capsule does once a result it could not paste back is copied.
 *
 * A refused permission blocks every replacement until it is granted, so it
 * stays on screen as a notice with its pane one click away. Any other cause is
 * a passing incident: an announcement, and the capsule closes.
 */
export function afterCopiedInstead(
  failure: Readonly<{ reason?: string; permission?: SystemPermissionPane }>,
  t: Translate,
): { kind: "notice"; notice: CapsuleNotice } | { kind: "announce"; message: string } {
  if (failure.permission !== undefined) {
    return { kind: "notice", notice: replaceBlockedNotice(failure.permission) };
  }
  return {
    kind: "announce",
    message:
      failure.reason === undefined
        ? t("capsule.replaceUnavailable")
        : t("capsule.replaceUnavailableWhy", { reason: failure.reason }),
  };
}

export interface NoticeText {
  /** A first line in bold; only a permission notice has one. */
  title: string | null;
  /** The sentences under it, in reading order. */
  body: string[];
}

const ALLOW: Record<SystemPermissionPane, DesktopMessageKey> = {
  accessibility: "capsule.permission.allowAccessibility",
  automation: "capsule.permission.allowAutomation",
};

/**
 * The words of a notice, translated at render time rather than when the
 * capture returns: on the first opening, the capture comes back before the
 * catalogue, and a notice translated then showed its raw keys.
 */
export function noticeText(notice: CapsuleNotice, t: Translate): NoticeText {
  if (notice.kind === "permission") {
    const blocked =
      notice.blocked === "capture"
        ? "capsule.permission.captureBlocked"
        : "capsule.permission.replaceBlocked";
    return {
      title: t(blocked),
      body: [
        t(ALLOW[notice.pane]),
        ...(notice.blocked === "replace" ? [t("capsule.permission.resultCopied")] : []),
        ...(notice.clipboardSuggested ? [t("capsule.permission.clipboardInField")] : []),
      ],
    };
  }
  return {
    title: null,
    body: [
      ...(notice.reason === null ? [] : [asSentence(notice.reason)]),
      ...(notice.clipboardSuggested ? [t("capsule.clipboardSuggested")] : []),
    ],
  };
}

/**
 * What the capsule's height depends on: the words, which set the number of
 * lines, and the kind, which adds a title and a button. Empty without a notice.
 */
export function noticeKey(notice: CapsuleNotice | null, t: Translate): string {
  return notice === null ? "" : JSON.stringify({ kind: notice.kind, ...noticeText(notice, t) });
}

/**
 * The main process words a capture's reason as a fragment ("no selection"),
 * made to follow a colon. Followed by another sentence, it needs a capital and
 * a full stop to read as one.
 */
export function asSentence(fragment: string): string {
  const text = fragment.trim();
  if (text === "") return text;
  const capitalised = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  return /[.!?…:]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}
