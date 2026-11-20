import { cx } from "@/utils/cx";

/**
 * Monochrome geometric brand emblem for Wassalha.
 * Radial 8-ray compass/message mark inspired by Swiss editorial precision.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cx("size-6 shrink-0 text-current", className)}
    >
      <rect x="11" y="2" width="2" height="5.5" fill="currentColor" />
      <rect x="11" y="16.5" width="2" height="5.5" fill="currentColor" />
      <rect x="2" y="11" width="5.5" height="2" fill="currentColor" />
      <rect x="16.5" y="11" width="5.5" height="2" fill="currentColor" />
      <rect x="4.93" y="4.93" width="2" height="5.2" transform="rotate(-45 4.93 4.93)" fill="currentColor" />
      <rect x="14.95" y="14.95" width="2" height="5.2" transform="rotate(-45 14.95 14.95)" fill="currentColor" />
      <rect x="17.66" y="4.93" width="2" height="5.2" transform="rotate(45 17.66 4.93)" fill="currentColor" />
      <rect x="7.64" y="14.95" width="2" height="5.2" transform="rotate(45 7.64 14.95)" fill="currentColor" />
      <rect x="10.25" y="10.25" width="3.5" height="3.5" fill="currentColor" />
    </svg>
  );
}
