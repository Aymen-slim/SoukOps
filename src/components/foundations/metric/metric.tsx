import type { ComponentType, ReactNode } from "react";
import { cx } from "@/utils/cx";

export function Metric({
  label,
  value,
  icon: Icon,
  iconClassName,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-2.5 rounded-xl bg-primary px-3.5 py-3 shadow-xs ring-1 ring-secondary", className)}>
      {Icon ? <Icon className={cx("size-4 shrink-0 text-brand-secondary", iconClassName)} aria-hidden="true" /> : null}
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold tabular-nums leading-none text-primary">{value}</p>
        <p className="mt-1 text-[10px] text-tertiary">{label}</p>
        {children}
      </div>
    </div>
  );
}
