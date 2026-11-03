import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, InfoCircle } from "@untitledui/icons";
import { cx } from "@/utils/cx";

const styles = {
  error: { root: "border-utility-red-200 bg-error-primary text-error-primary", icon: AlertCircle },
  warning: { root: "border-utility-yellow-200 bg-warning-primary text-warning-primary", icon: AlertTriangle },
  success: { root: "border-utility-green-200 bg-success-primary text-success-primary", icon: CheckCircle },
  info: { root: "border-utility-blue-200 bg-utility-blue-50 text-utility-blue-700", icon: InfoCircle },
} as const;

export type AlertColor = keyof typeof styles;

export function Alert({
  color = "error",
  title,
  children,
  action,
  className,
}: {
  color?: AlertColor;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { root, icon: Icon } = styles[color];
  return (
    <div role="alert" className={cx("flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm", root, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title && "mt-0.5")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
