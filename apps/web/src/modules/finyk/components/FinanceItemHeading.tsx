import type { ReactNode } from "react";

/** Назва й дії сутності, головна сума, потім підпорядковані деталі. */
export function FinanceItemHeading({
  title,
  meta,
  value,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-style-body font-semibold text-text wrap-break-word">
            {title}
          </p>
          {meta && (
            <div className="mt-1 text-style-caption text-muted">{meta}</div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        )}
      </div>
      {value != null && (
        <div className="mt-3 text-style-title font-semibold tabular-nums text-text">
          {value}
        </div>
      )}
    </div>
  );
}
