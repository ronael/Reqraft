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
  /** `alert` interrompt la lecture, `status` attend une pause. */
  role?: "status" | "alert";
  className?: string;
}

export function InlineMessage({
  tone,
  children,
  role = "status",
  className,
}: Readonly<InlineMessageProps>): React.JSX.Element {
  const Icon = TONE_ICONS[tone];
  const classes = ["inline-message", `inline-message-${tone}`, className].filter(Boolean).join(" ");
  const iconClasses = tone === "pending" ? "inline-message-icon spin" : "inline-message-icon";

  return (
    <div className={classes} role={role}>
      <Icon size={13} className={iconClasses} aria-hidden />
      <span className="inline-message-text">{children}</span>
    </div>
  );
}
