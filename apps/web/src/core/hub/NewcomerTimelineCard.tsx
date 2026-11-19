/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Що зʼявиться і коли» — картка порожнього хаба на місці смуги «Модулів
 * увімкнено: N з 4» (С-4 (а), П-20 (А), спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`). Один блок замість
 * двох: прогрес живе в самій картці, на рядку, умова якого числова.
 */
import { pluralDays } from "@sergeant/shared";
import { ProgressBar } from "@shared/components/ui";
import { coreMessages } from "@shared/i18n/uk.core";
import {
  buildNewcomerTimeline,
  type NewcomerTimelineInput,
  type NewcomerTimelineRow,
} from "./newcomerTimeline";

const copy = coreMessages.hub.newcomerTimeline;

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

function rowText(row: NewcomerTimelineRow): { what: string; when: string } {
  switch (row.id) {
    case "bankFacts":
      return { what: copy.bankFactsWhat, when: copy.bankFactsWhen };
    case "weekReport":
      return { what: copy.weekReportWhat, when: copy.weekReportWhen };
    case "links": {
      const days = row.progress?.max ?? 0;
      return {
        what: copy.linksWhat,
        when: fill(copy.linksWhen, { days, unit: pluralDays(days) }),
      };
    }
  }
}

export function NewcomerTimelineCard(props: NewcomerTimelineInput) {
  const rows = buildNewcomerTimeline(props);
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="newcomer-timeline-title"
      data-testid="newcomer-timeline"
      className="rounded-panel border border-line bg-panel px-4 py-3 space-y-2"
    >
      <h2 id="newcomer-timeline-title" className="text-style-label text-text">
        {copy.title}
      </h2>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const { what, when } = rowText(row);
          const progressLabel = row.progress
            ? fill(copy.linksProgress, {
                value: row.progress.value,
                max: row.progress.max,
                unit: pluralDays(row.progress.max),
              })
            : null;
          return (
            <li
              key={row.id}
              data-testid={`newcomer-timeline-${row.id}`}
              className="py-2 space-y-1"
            >
              <p className="text-style-body text-text">{what}</p>
              <p className="text-style-caption text-muted">{when}</p>
              {row.progress && progressLabel ? (
                <div className="flex items-center gap-3">
                  <ProgressBar
                    value={row.progress.value}
                    max={row.progress.max}
                    size="sm"
                    className="flex-1"
                    aria-label={`${what} · ${progressLabel}`}
                  />
                  <span className="text-style-caption text-muted whitespace-nowrap">
                    {progressLabel}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
