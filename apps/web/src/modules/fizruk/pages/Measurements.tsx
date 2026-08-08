import { useCallback, useMemo, useState } from "react";
import { z } from "zod";
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

// F3: runtime range gate — mirrors <input min max> attributes so a
// browser-bypass or programmatic submit cannot persist out-of-range PII.
const measurementSchema = z.object(
  Object.fromEntries(
    MEASURE_FIELDS.map((f) => [
      f.id,
      z
        .number()
        .min(f.min, `${f.label}: мін ${f.min} ${f.unit}`)
        .max(f.max, `${f.label}: макс ${f.max} ${f.unit}`)
        .optional(),
    ]),
  ),
);

const inp =
  "input-focus-fizruk w-full h-11 rounded-2xl border border-line bg-panelHi px-4 text-text";

// Field-caption styling for the measurements grid. This is a genuine form
// <label> (htmlFor/id bound below), not a narrative eyebrow, so the
// uppercase + tracking combo is intentional here.
const lbl =
  "px-1 block text-xs uppercase tracking-wider font-bold text-fizruk-strong dark:text-fizruk-300/70";

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
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])),
  );
  /**
   * Помилки діапазону — під конкретним полем, не в тості.
   *
   * До 2026-08-05 zod віддавав лише ПЕРШУ проблему, і вона летіла
   * `toast.warning` у нижній кут: із восьми полів користувач не бачив, яке
   * саме завелике, і мусив здогадуватись. Тепер підписані всі поля, що не
   * пройшли, — рівно там, де їх виправляти.
   */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
      <div className="flex-1 overflow-y-auto">
        <article className="max-w-2xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
          <button
            type="button"
            onClick={() => setGuideOpen(false)}
            className="inline-flex items-center gap-1 min-h-11 text-style-label text-fizruk-strong hover:underline"
          >
            <Icon name="chevron-left" size="sm" />
            {messages.fizruk.measurements.guideBack}
          </button>
          <Card radius="lg" className="space-y-4">
            <div>
              <SectionHeading as="h2" size="lg">
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
                className="min-h-11 inline-flex items-center text-fizruk-strong hover:underline"
              >
                {messages.fizruk.measurements.guideWhoLink}
              </a>
              <a
                href="https://www.nhs.uk/health-assessment-tools/calculate-your-waist-to-height-ratio"
                target="_blank"
                rel="noreferrer"
                className="min-h-11 inline-flex items-center text-fizruk-strong hover:underline"
              >
                {messages.fizruk.measurements.guideCdcLink}
              </a>
            </div>
          </Card>
        </article>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-3">
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className="flex items-center gap-3 bg-panel border border-line rounded-2xl p-4 shadow-card"
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

        <Card radius="lg">
          <SectionHeading as="div" size="xs" className="mb-3" variant="fizruk">
            {messages.fizruk.measurements.addHeading}
          </SectionHeading>
          <div className="grid grid-cols-2 gap-2">
            {MEASURE_FIELDS.map((f) => (
              <div key={f.id} className="space-y-1">
                {/* WCAG 1.3.1: explicit label association via htmlFor/id. */}
                <label htmlFor={`measure-input-${f.id}`} className={lbl}>
                  {f.label} · {f.unit}
                </label>
                <input
                  id={`measure-input-${f.id}`}
                  className={inp}
                  // `type="text"` навмисно: `type="number"` мовчки відкидає
                  // кому як десятковий роздільник — UA-мобільна клавіатура
                  // дає «82,5», браузер обнуляє `value` ще ДО того, як цей
                  // компонент побачить подію, тож нормалізація коми на
                  // сабміті нижче (`v.replace(",", ".")`) ставала
                  // недосяжною: значення губилось раніше. `inputMode="decimal"`
                  // усе одно піднімає числову клавіатуру. Межі f.min/f.max —
                  // той самий підхід, що й у ManualExpenseAmountSection —
                  // лишаються enforced нижче: zod-схема (`measurementSchema`)
                  // на сабміті і повторний clamp у `useMeasurements.addEntry`.
                  type="text"
                  inputMode="decimal"
                  placeholder="—"
                  value={form[f.id] ?? ""}
                  aria-invalid={fieldErrors[f.id] ? true : undefined}
                  aria-describedby={
                    fieldErrors[f.id] ? `measure-error-${f.id}` : undefined
                  }
                  onChange={(e) => {
                    setForm((s: Record<string, string>) => ({
                      ...s,
                      [f.id]: e.target.value,
                    }));
                    setFieldErrors((prev) => {
                      if (!prev[f.id]) return prev;
                      const next = { ...prev };
                      delete next[f.id];
                      return next;
                    });
                  }}
                />
                {fieldErrors[f.id] && (
                  <p
                    id={`measure-error-${f.id}`}
                    role="alert"
                    className="text-style-caption text-danger-strong dark:text-danger"
                  >
                    {fieldErrors[f.id]}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3">
            {(() => {
              // F4: forbid saving a fully-empty form — button disabled until at
              // least one field has a parseable numeric value. NaN inputs
              // ("abc") are stripped before persisting so a stray entry cannot
              // pollute the snapshot.
              // F3: run the zod range schema and surface first error via toast
              // so out-of-range PII (negative weight, 99 999 kg, etc.) can
              // never reach the SQLite dual-write pipeline.
              const parsedPayload: Record<string, number> = {};
              for (const f of MEASURE_FIELDS) {
                const v = (form[f.id] || "").trim();
                if (!v) continue;
                const n = Number(v.replace(",", "."));
                if (Number.isFinite(n)) parsedPayload[f.id] = n;
              }
              const hasAnyValue = Object.keys(parsedPayload).length > 0;
              return (
                <button
                  type="button"
                  disabled={!hasAnyValue}
                  aria-disabled={!hasAnyValue}
                  className="focus-ring w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                  onClick={() => {
                    if (!hasAnyValue) return;
                    const validation =
                      measurementSchema.safeParse(parsedPayload);
                    if (!validation.success) {
                      const next: Record<string, string> = {};
                      for (const issue of validation.error.issues) {
                        const key = issue.path[0];
                        if (typeof key !== "string") continue;
                        next[key] ??=
                          issue.message ||
                          messages.fizruk.measurements.invalidValue;
                      }
                      setFieldErrors(next);
                      return;
                    }
                    setFieldErrors({});
                    addEntry(parsedPayload);
                    setForm(
                      Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, ""])),
                    );
                  }}
                >
                  {messages.fizruk.measurements.submit}
                </button>
              );
            })()}
          </div>
        </Card>

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
                    <div className="text-lg font-extrabold tabular-nums text-text mt-1">
                      {Number.isFinite(Number(latest[f.id]))
                        ? Number(latest[f.id]).toLocaleString("uk-UA")
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
                          {delta.toFixed(1)} {f.unit}
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
          {(entries || []).map((e) => (
            <div
              key={e.id}
              className="px-4 py-3 border-b border-line last:border-0"
            >
              <div className="flex items-center justify-between">
                <div className="text-style-label text-text">
                  {new Date(e.at).toLocaleDateString("uk-UA", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
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
                {MEASURE_FIELDS.filter((f) => e[f.id] != null)
                  .slice(0, 4)
                  .map(
                    (f) =>
                      `${f.label}: ${Number(e[f.id]).toLocaleString("uk-UA")} ${f.unit}`,
                  )
                  .join(" · ") || "—"}
              </div>
            </div>
          ))}
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
