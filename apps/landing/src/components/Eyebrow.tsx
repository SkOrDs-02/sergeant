import type { ReactNode } from "react";

/**
 * Centralized "eyebrow" label for the marketing landing.
 *
 * The `uppercase` + `tracking-*` + `text-*` combo is intentional narrative
 * typography on the marketing site, so the `sergeant-design/no-eyebrow-drift`
 * escape hatch lives here once instead of being scattered across every section.
 * Callers pass tone/weight/alignment via `className`.
 */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional marketing eyebrow label, centralized in this component
    <span className={`text-xs uppercase tracking-widest ${className}`}>
      {children}
    </span>
  );
}
