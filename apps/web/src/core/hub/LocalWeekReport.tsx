/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import type { Ref } from "react";
import { messages } from "@shared/i18n/uk";

interface LocalWeekReportProps {
  lines: readonly string[];
  /**
   * Куди приводить «Відкрити звіт тижня» з картки про темп витрат: блок
   * докручується й отримує фокус (`HubInsightsBlock` → `CollapsibleSection`).
   */
  sectionRef?: Ref<HTMLElement> | undefined;
}

/**
 * Локальний звіт тижня (Р23): рядки з правил, пораховані на пристрої, тож
 * блок не порожніє без мережі чи AI-квоти. AI-порада стоїть над ним.
 */
export function LocalWeekReport({ lines, sectionRef }: LocalWeekReportProps) {
  if (lines.length === 0) return null;
  return (
    <section
      ref={sectionRef}
      // Програмний фокус після «Відкрити звіт тижня»: регіон із назвою
      // озвучується, а контур не малюється, бо це не інтерактивний елемент.
      tabIndex={-1}
      aria-label={messages.finyk.weekReport.heading}
      className="rounded-2xl border border-line bg-panel px-4 py-3 space-y-1.5 focus:outline-none"
    >
      <p className="text-style-caption text-subtle">
        {messages.finyk.weekReport.heading}
      </p>
      <ul className="space-y-1 text-style-body text-text">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
