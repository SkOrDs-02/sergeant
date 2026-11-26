/**
 * Рядок «Минулий: …» під значенням звітної картки хабу.
 *
 * Коли поточний період ще триває, попередній береться за стільки ж перших
 * днів (`reportWindows`), тож число тут менше за те, що людина бачить на
 * екрані минулого періоду. Логіку порівняння це не міняє, лише пояснює її
 * однією короткою приміткою (FULL-20261126).
 */
import type { ReactNode } from "react";
import { messages } from "@shared/i18n/uk";
import type { Period } from "./hubReports.aggregation";

export function ReportPreviousLine({
  partial,
  period,
  children,
}: {
  partial: boolean;
  period: Period;
  children: ReactNode;
}) {
  return (
    <>
      <p className="text-style-caption text-muted">
        {partial
          ? messages.hub.reportPreviousToDate
          : messages.hub.reportPrevious}{" "}
        {children}
      </p>
      {partial && (
        <p
          className="text-style-caption text-muted"
          data-testid="report-partial-note"
        >
          {period === "week"
            ? messages.hub.reportPartialNoteWeek
            : messages.hub.reportPartialNoteMonth}
        </p>
      )}
    </>
  );
}
