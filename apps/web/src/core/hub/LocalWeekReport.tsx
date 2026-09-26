/**
 * Last validated: 2026-09-25
 * Status: Active
 */
import { messages } from "@shared/i18n/uk";

interface LocalWeekReportProps {
  lines: readonly string[];
}

/**
 * Локальний звіт тижня (Р23): рядки з правил, пораховані на пристрої, тож
 * блок не порожніє без мережі чи AI-квоти. AI-порада стоїть над ним.
 */
export function LocalWeekReport({ lines }: LocalWeekReportProps) {
  if (lines.length === 0) return null;
  return (
    <section
      aria-label={messages.finyk.weekReport.heading}
      className="rounded-2xl border border-line bg-panel px-4 py-3 space-y-1.5"
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
