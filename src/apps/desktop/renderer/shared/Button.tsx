import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "violet" | "neutral";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

/** Shared desktop action button. Geometry stays in desktop.css for every variant. */
export function Button({
  className,
  type = "button",
  variant = "violet",
  ...props
}: Readonly<ButtonProps>): React.JSX.Element {
  const classes = ["design-button", `design-button-${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return <button {...props} type={type} className={classes} />;
}
