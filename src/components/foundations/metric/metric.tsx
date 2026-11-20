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
    <div className={cx("flex items-center gap-3 rounded-none bg-primary px-4 py-3.5 ring-1 ring-secondary", className)}>
      {Icon ? <Icon className={cx("size-4 shrink-0 text-brand-secondary", iconClassName)} aria-hidden="true" /> : null}
      <div className="min-w-0">
        <p className="font-mono text-base font-medium tabular-nums leading-none text-primary">{value}</p>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-tertiary">{label}</p>
        {children}
      </div>
    </div>
  );
}
