import type { ReactNode } from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export type MessageTone = "info" | "pending" | "success" | "warning" | "error";

const TONE_ICONS: Record<MessageTone, LucideIcon> = {
  info: Info,
  pending: LoaderCircle,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
};

export interface InlineMessageProps {
  tone: MessageTone;
  children: ReactNode;
  /** A first line in bold, for a message with more than one thing to say. */
  title?: ReactNode;
  /** The one control that resolves what the message reports, on its right. */
  action?: ReactNode;
  /** `alert` interrompt la lecture, `status` attend une pause. */
  role?: "status" | "alert";
  className?: string;
}

export function InlineMessage({
  tone,
  children,
  title,
  action,
  role = "status",
  className,
}: Readonly<InlineMessageProps>): React.JSX.Element {
  const Icon = TONE_ICONS[tone];
  const classes = [
    "inline-message",
    `inline-message-${tone}`,
    action === undefined ? null : "inline-message-with-action",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const iconClasses = tone === "pending" ? "inline-message-icon spin" : "inline-message-icon";

  return (
    <div className={classes} role={role}>
      <Icon size={13} className={iconClasses} aria-hidden />
      <span className="inline-message-text">
        {title !== undefined && <strong className="inline-message-title">{title}</strong>}
        {children}
      </span>
      {action !== undefined && <div className="inline-message-action">{action}</div>}
    </div>
  );
}
