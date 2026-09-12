import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { measurementGuideRows } from "@shared/i18n/uk.fizruk";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Icon } from "@shared/components/ui/Icon";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { DataTable } from "@shared/components/ui/DataTable";
import {
  MEASURE_FIELDS,
  useMeasurements,
  type MeasurementEntry,
} from "../hooks/useMeasurements";
import { Card } from "@shared/components/ui/Card";
import { Stat } from "@shared/components/ui/Stat";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { AddMeasurementForm } from "./Measurements/AddMeasurementForm";
import { formatNumberUk } from "@sergeant/shared";
import { fmt } from "../lib/numberFmt";

// Programmatic-focus target for the guide view's `<h2>` — see the
// scroll/focus-management effect below.
const GUIDE_HEADING_ID = "measurements-guide-heading";

// History row shows at most this many filled fields before collapsing the
// rest behind a "+N ще" toggle (defect #7 — a record can carry up to 14
// fields, and slicing to 4 used to drop the rest with no indicator).
const HISTORY_ROW_FIELD_LIMIT = 4;

export function Measurements() {
  const [guideOpen, setGuideOpen] = useState(false);
  const { entries, addEntry, deleteEntry, restoreEntry } = useMeasurements();
  const toast = useToast();
  const handleDelete = useCallback(
    (id: string) => {
      const snapshot = entries.find((e: MeasurementEntry) => e.id === id);
      if (!snapshot) return;
      deleteEntry(id);
      showUndoToast(toast, {
        msg: "Замір видалено",
        onUndo: () => restoreEntry(snapshot),
      });
    },
    [entries, deleteEntry, restoreEntry, toast],
  );

  // Guide-view scroll/focus management (defect #9). Both the guide branch
  // and the main branch render the same top-level `.flex-1.overflow-y-auto`
  // element in the same position, so React reconciles them onto ONE DOM
  // node across the `guideOpen` toggle and its `scrollTop` survives the
  // swap — reset it explicitly on every toggle. Move focus to the new
  // view's entry point too, otherwise a keyboard/SR user is left pointing
  // at a node that just left the DOM (WCAG 2.4.3 focus order): the guide's
  // own `<h2>` when opening, the trigger button when closing (return focus
  // to the invoker — the main view has no page-level heading to target).
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const isInitialGuideRender = useRef(true);
  useEffect(() => {
    // Plain `scrollTop` assignment, not `scrollTo({ top: 0 })`: jsdom only
    // stubs `window.scrollTo`, not the `Element.prototype` method, so the
    // richer API throws under Vitest/RTL. A snap-to-top on a view swap
    // doesn't need smooth-scroll anyway.
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    if (isInitialGuideRender.current) {
      isInitialGuideRender.current = false;
      return;
    }
    if (guideOpen) {
      document.getElementById(GUIDE_HEADING_ID)?.focus();
    } else {
      guideTriggerRef.current?.focus();
    }
  }, [guideOpen]);

  // History-row disclosure (defect #7) — a record can carry up to 14
  // fields; rows over `HISTORY_ROW_FIELD_LIMIT` collapse behind "+N ще".
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleHistoryRow = useCallback((id: string) => {
    setExpandedHistoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const latest = entries[0] || null;
  const deltas = useMemo<Record<string, number>>(() => {
    const prev = entries[1] || null;
    if (!latest || !prev) return {};
    const out: Record<string, number> = {};
    for (const f of MEASURE_FIELDS) {
      const a = Number(latest[f.id]);
      const b = Number(prev[f.id]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const d = a - b;
      if (d === 0) continue;
      out[f.id] = d;
    }
    return out;
  }, [entries, latest]);

  const stats = useMemo(() => {
    const total = entries?.length || 0;
    const latestAt = latest?.at
      ? new Date(latest.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        })
      : "—";
    const filledLatest = latest
      ? MEASURE_FIELDS.filter((f) => latest[f.id] != null).length
      : 0;
    return { total, latestAt, filledLatest };
  }, [entries, latest]);

  if (guideOpen) {
    return (
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <article className="max-w-2xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
          <button
            type="button"
            onClick={() => setGuideOpen(false)}
            className="focus-ring rounded-lg inline-flex items-center gap-1 min-h-11 text-style-label text-fizruk-strong hover:underline"
          >
            <Icon name="chevron-left" size="sm" />
            {messages.fizruk.measurements.guideBack}
          </button>
          <Card radius="lg" className="space-y-4">
            <div>
              {/* `id` + `tabIndex={-1}` — programmatic focus target for the
                  scroll/focus-management effect above (not part of tab
                  order; SectionHeading isn't a forwardRef component, so a
                  DOM ref isn't available here — id + getElementById is the
                  pragmatic substitute). */}
              <SectionHeading
                as="h2"
                size="lg"
                id={GUIDE_HEADING_ID}
                tabIndex={-1}
              >
                {messages.fizruk.measurements.guideTitle}
              </SectionHeading>
              <p className="mt-2 text-style-body text-subtle leading-relaxed">
                {messages.fizruk.measurements.guideIntro}
              </p>
            </div>
            <ol className="list-decimal pl-5 space-y-3 text-style-body text-text leading-relaxed">
              <li>{messages.fizruk.measurements.guideStep1}</li>
              <li>{messages.fizruk.measurements.guideStep2}</li>
              <li>{messages.fizruk.measurements.guideStep3}</li>
              <li>{messages.fizruk.measurements.guideStep4}</li>
            </ol>
            <div
              data-testid="measurement-guide-table-scroll"
              className="w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain rounded-2xl border border-line"
            >
              <DataTable
                module="fizruk"
                className="min-w-[560px]"
                caption={messages.fizruk.measurements.guideTitle}
                getRowKey={(row) => row.metric}
                columns={[
                  {
                    id: "metric",
                    header: messages.fizruk.measurements.guideMetricHeader,
                    rowHeader: true,
                    cell: (row) => row.metric,
                  },
                  {
                    id: "place",
                    header: messages.fizruk.measurements.guidePlaceHeader,
                    cell: (row) => row.place,
                  },
                  {
                    id: "technique",
                    header: messages.fizruk.measurements.guideTechniqueHeader,
                    cell: (row) => row.technique,
                  },
                ]}
                rows={measurementGuideRows}
              />
            </div>
            <p className="text-style-caption text-subtle leading-relaxed">
              {messages.fizruk.measurements.guideDisclaimer}
            </p>
            <div className="flex flex-wrap gap-3 text-style-caption">
              <a
                href="https://www.cdc.gov/diabetes/living-with/healthy-weight.html"
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-lg min-h-11 inline-flex items-center text-fizruk-strong hover:underline"
              >
                {messages.fizruk.measurements.guideWhoLink}
                <span className="sr-only">
                  {" "}
                  {messages.fizruk.measurements.manualLinkNewTab}
                </span>
              </a>
              <a
                href="https://www.nhs.uk/health-assessment-tools/calculate-your-waist-to-height-ratio"
                target="_blank"
                rel="noreferrer"
                className="focus-ring rounded-lg min-h-11 inline-flex items-center text-fizruk-strong hover:underline"
              >
                {messages.fizruk.measurements.guideCdcLink}
                <span className="sr-only">
                  {" "}
                  {messages.fizruk.measurements.manualLinkNewTab}
                </span>
              </a>
            </div>
          </Card>
        </article>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <button
          ref={guideTriggerRef}
          type="button"
          onClick={() => setGuideOpen(true)}
          className="focus-ring flex items-center gap-3 bg-panel border border-line rounded-2xl p-4 shadow-card"
        >
          <div className="shrink-0 w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success">
            <svg
              aria-hidden
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <SectionHeading as="div" size="xs" variant="fizruk">
              {messages.fizruk.measurements.manual}
            </SectionHeading>
            <div className="text-style-label text-success-strong dark:text-success mt-0.5 inline-flex items-center gap-0.5">
              {messages.fizruk.measurements.manualLink}
              <Icon name="chevron-right" size="sm" />
            </div>
          </div>
        </button>

        <div className="grid grid-cols-3 gap-2">
          <Card radius="lg" padding="sm">
            <Stat
              label={messages.fizruk.measurements.records}
              value={stats.total}
              size="sm"
              align="center"
            />
          </Card>
          <Card radius="lg" padding="sm">
            <Stat
              label={messages.fizruk.measurements.last}
              value={<span className="text-style-label">{stats.latestAt}</span>}
              size="sm"
              align="center"
            />
          </Card>
          <Card radius="lg" padding="sm">
            <Stat
              label={messages.fizruk.measurements.fields}
              value={stats.filledLatest}
              size="sm"
              align="center"
            />
          </Card>
        </div>

        <AddMeasurementForm addEntry={addEntry} />

        {/*
          П3 «край і зріз»: «Останній запис» і журнал «Історія» нижче
          виглядають як стос, але не є ним — між картками стоїть той самий
          `space-y-3`, що й між усіма іншими секціями сторінки (формою
          додавання, статами). Стос вимагає СУМІЖНОСТІ: тут її немає, тож
          `rule`/`perf` неправдиво стверджували б неперервність. Кожна
          картка лишається самодостатнім аркушем — `edge="stub"`.
        */}
        {latest && (
          <Card edge="stub" padding="none">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <SectionHeading as="div" size="xs" variant="fizruk">
                    {messages.fizruk.measurements.lastEntry}{" "}
                    <span className="ml-1 normal-case tracking-normal font-medium text-subtle">
                      · {stats.latestAt}
                    </span>
                  </SectionHeading>
                </div>
                <div className="text-style-caption text-subtle">
                  {Object.keys(deltas).length ? "Δ від попереднього" : ""}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {MEASURE_FIELDS.filter((f) => latest[f.id] != null).map((f) => (
                  <div
                    key={f.id}
                    className="bg-bg border border-line rounded-2xl p-3"
                  >
                    <SectionHeading as="div" size="xs" variant="fizruk">
                      {f.label}
                    </SectionHeading>
                    {}
                    <div className="text-lg font-extrabold tabular-nums text-text mt-1">
                      {Number.isFinite(Number(latest[f.id]))
                        ? formatNumberUk(Number(latest[f.id]))
                        : "—"}{" "}
                      {f.unit}
                    </div>
                    {(() => {
                      const delta = deltas[f.id];
                      return delta != null ? (
                        <div
                          className={cn(
                            "text-style-caption mt-1",
                            delta > 0
                              ? "text-warning-strong dark:text-warning"
                              : "text-success-strong dark:text-success",
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {fmt(delta, 1)} {f.unit}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/*
          Журнал записів за датами — теж окремий аркуш, а не «низ» стосу
          (та сама причина вище). `overflow-hidden` знято: він жив тут лише
          заради скруглення рядків під `rounded-2xl`, а край скасовує
          скруглення взагалі — та сама правка, що в `WeeklyDigestCard`.
        */}
        <Card edge="stub" padding="none">
          <div className="px-4 py-3 bg-panelHi/60 border-b border-line">
            <SectionHeading as="div" size="xs" variant="fizruk">
              {messages.fizruk.measurements.history}
            </SectionHeading>
          </div>
          {(entries || []).map((e) => {
            const dateLabel = new Date(e.at).toLocaleDateString("uk-UA", {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const filledFields = MEASURE_FIELDS.filter((f) => e[f.id] != null);
            // Defect #7: a record can carry up to 14 fields — silently
            // slicing to 4 dropped the rest with no indicator. Collapse
            // behind an explicit "+N ще" toggle instead so nothing is lost
            // without a trace.
            const hasOverflow = filledFields.length > HISTORY_ROW_FIELD_LIMIT;
            const isRowExpanded = expandedHistoryIds.has(e.id);
            const visibleFields = isRowExpanded
              ? filledFields
              : filledFields.slice(0, HISTORY_ROW_FIELD_LIMIT);
            const hiddenCount = filledFields.length - visibleFields.length;
            return (
              <div
                key={e.id}
                className="px-4 py-3 border-b border-line last:border-0"
              >
                <div className="flex items-center justify-between">
                  <div className="text-style-label text-text">{dateLabel}</div>
                  <button
                    type="button"
                    aria-label={messages.fizruk.measurements.deleteAria}
                    className="focus-ring touch-target -mr-2 px-2 inline-flex items-center justify-center rounded-full text-style-caption text-danger-strong hover:text-danger transition-colors"
                    onClick={() => handleDelete(e.id)}
                  >
                    {messages.actions.delete}
                  </button>
                </div>
                <div className="text-style-caption text-subtle mt-1">
                  {visibleFields
                    .map(
                      (f) =>
                        `${f.label}: ${formatNumberUk(Number(e[f.id]))} ${f.unit}`,
                    )
                    .join(" · ") || "—"}
                  {hasOverflow && (
                    <button
                      type="button"
                      className="focus-ring touch-target ml-1 -my-2 px-1 rounded-lg inline-flex items-center text-fizruk-strong dark:text-fizruk font-semibold hover:underline"
                      aria-expanded={isRowExpanded}
                      aria-label={
                        isRowExpanded
                          ? `${messages.fizruk.measurements.collapseFieldsLabel}: ${messages.fizruk.measurements.showAllFieldsAriaSuffix} ${dateLabel}`
                          : `+${hiddenCount} ${messages.fizruk.measurements.moreFieldsSuffix}: ${messages.fizruk.measurements.showAllFieldsAriaSuffix} ${dateLabel}`
                      }
                      onClick={() => toggleHistoryRow(e.id)}
                    >
                      {isRowExpanded
                        ? messages.fizruk.measurements.collapseFieldsLabel
                        : `+${hiddenCount} ${messages.fizruk.measurements.moreFieldsSuffix}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {(entries || []).length === 0 && (
            <EmptyState
              compact
              title={messages.fizruk.measurements.emptyTitle}
              description={messages.fizruk.measurements.emptyDescription}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
