import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Label } from "@shared/components/ui/FormField";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/cn";
import { useDailyLog } from "../hooks/useDailyLog";
import { Card } from "@shared/components/ui/Card";
import { MiniLineChart } from "../components/MiniLineChart";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";

/**
 * Trend cards on this page used to be always-expanded, which meant four
 * ~180px-tall charts stacked one after another — on mobile Safari that
 * pushed the useful summary + input form far off-screen. The user asked
 * for them to be collapsible, so each chart card is now wrapped in
 * `CollapsibleTrendCard`:
 *
 *  - Default: collapsed, showing only the title + a latest-value +
 *    delta teaser, so the page reads as a compact list at first load.
 *  - Tap/click the header to toggle. Per-card open state is persisted
 *    in localStorage under `fizruk:body:trend-open:<key>` so the user's
 *    choice survives reloads.
 *
 * The "Журнал" log section uses the same collapse pattern via
 * `JournalSection` (open by default; persisted under
 * `fizruk:body:journal-open`), and each entry inside is itself
 * collapsible via `JournalEntryCard` (closed by default — only the
 * date + a short metric summary are shown until tapped; persisted
 * under `fizruk:body:journal-entry-open:<id>`).
 */
const TREND_STORAGE_PREFIX = "fizruk:body:trend-open:";
const JOURNAL_OPEN_STORAGE_KEY = "fizruk:body:journal-open";
const JOURNAL_ENTRY_OPEN_PREFIX = "fizruk:body:journal-entry-open:";

type JournalEntry = {
  id: string;
  at: string;
  weightKg: number | null;
  sleepHours: number | null;
  energyLevel: number | null;
  moodScore: number | null;
  note: string;
};

function readTrendOpen(key: string): boolean {
  return safeReadStringLS(TREND_STORAGE_PREFIX + key) === "1";
}

function readPersistedOpen(storageKey: string, fallback: boolean): boolean {
  const v = safeReadStringLS(storageKey);
  if (v === "1") return true;
  if (v === "0") return false;
  return fallback;
}

function writePersistedOpen(storageKey: string, open: boolean): void {
  safeWriteLS(storageKey, open ? "1" : "0");
}

function CollapsibleTrendCard({
  storageKey,
  title,
  latestValue,
  latestUnit,
  delta,
  ariaLabel,
  children,
}: {
  storageKey: string;
  title: string;
  latestValue: number | null;
  latestUnit: string;
  delta: number | null;
  ariaLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => readTrendOpen(storageKey));
  const contentId = `trend-card-content-${storageKey}`;

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(TREND_STORAGE_PREFIX + storageKey, next ? "1" : "0");
      return next;
    });
  }, [storageKey]);

  const deltaClass =
    delta == null || delta === 0
      ? "text-muted"
      : delta > 0
        ? "text-warning"
        : "text-success";
  const deltaLabel =
    delta == null
      ? ""
      : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${latestUnit}`;

  return (
    <Card as="section" radius="lg" padding="none" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "rounded-2xl transition-colors",
          "hover:bg-panelHi/40",
        )}
      >
        <div className="flex-1 min-w-0">
          <SectionHeading as="h2" size="sm" className="!mb-0">
            {title}
          </SectionHeading>
        </div>
        {latestValue != null && (
          <div className="flex items-baseline gap-2 shrink-0">
            <span className="text-sm font-semibold tabular-nums text-text">
              {latestValue} {latestUnit}
            </span>
            {delta != null && delta !== 0 && (
              <span className={cn("text-xs font-semibold", deltaClass)}>
                {deltaLabel}
              </span>
            )}
          </div>
        )}
        <span
          aria-hidden
          className={cn(
            "inline-block w-4 text-muted transition-transform shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          {children}
        </div>
      )}
    </Card>
  );
}

function JournalEntryCard({
  entry,
  onDelete,
}: {
  entry: JournalEntry;
  onDelete: (id: string) => void;
}) {
  const storageKey = JOURNAL_ENTRY_OPEN_PREFIX + entry.id;
  const [open, setOpen] = useState<boolean>(() =>
    readPersistedOpen(storageKey, false),
  );
  const contentId = `journal-entry-${entry.id}`;

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writePersistedOpen(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const dateLabel = new Date(entry.at).toLocaleDateString("uk-UA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
  });

  const summaryParts: string[] = [];
  if (entry.weightKg != null) summaryParts.push(`${entry.weightKg} кг`);
  if (entry.sleepHours != null) summaryParts.push(`${entry.sleepHours} год`);
  if (entry.energyLevel != null) summaryParts.push(`E ${entry.energyLevel}/5`);
  if (entry.moodScore != null) summaryParts.push(`M ${entry.moodScore}/5`);
  const summary = summaryParts.join(" · ");

  return (
    <div className="rounded-xl border border-line bg-bg">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={cn(
            "flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-left",
            "rounded-xl transition-colors hover:bg-panelHi/40",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block w-3 text-muted transition-transform shrink-0 text-xs",
              open ? "rotate-180" : "rotate-0",
            )}
          >
            ▾
          </span>
          <span className="text-xs text-subtle shrink-0">{dateLabel}</span>
          {!open && summary && (
            <span className="text-xs text-muted truncate">· {summary}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="shrink-0 w-8 h-8 m-1 flex items-center justify-center rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          aria-label="Видалити запис"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
          </svg>
        </button>
      </div>
      {open && (
        <div id={contentId} className="px-3 pb-3 pt-0">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {entry.weightKg != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">Вага:</span>{" "}
                <span className="font-semibold">{entry.weightKg} кг</span>
              </span>
            )}
            {entry.sleepHours != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">Сон:</span>{" "}
                <span className="font-semibold">{entry.sleepHours} год</span>
              </span>
            )}
            {entry.energyLevel != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">Енергія:</span>{" "}
                <span className="font-semibold">{entry.energyLevel}/5</span>
              </span>
            )}
            {entry.moodScore != null && (
              <span className="text-xs text-text">
                <span className="text-subtle">Настрій:</span>{" "}
                <span className="font-semibold">{entry.moodScore}/5</span>
              </span>
            )}
          </div>
          {entry.note && (
            <p className="text-xs text-subtle mt-1 italic">{entry.note}</p>
          )}
        </div>
      )}
    </div>
  );
}

function JournalSection({
  entries,
  totalCount,
  onDelete,
}: {
  entries: readonly JournalEntry[];
  totalCount: number;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState<boolean>(() =>
    readPersistedOpen(JOURNAL_OPEN_STORAGE_KEY, true),
  );
  const contentId = "fizruk-body-journal-content";

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      writePersistedOpen(JOURNAL_OPEN_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return (
    <Card as="section" radius="lg" padding="none" aria-label="Журнал записів">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 text-left",
          "rounded-2xl transition-colors hover:bg-panelHi/40",
        )}
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <SectionHeading as="h2" size="sm" className="!mb-0">
            Журнал
          </SectionHeading>
          <span className="text-xs text-muted tabular-nums">{totalCount}</span>
        </div>
        <span
          aria-hidden
          className={cn(
            "inline-block w-4 text-muted transition-transform shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        >
          ▾
        </span>
      </button>
      {open && (
        <div id={contentId} className="px-4 pb-4 pt-1">
          <div className="space-y-2">
            {entries.map((entry) => (
              <JournalEntryCard
                key={entry.id}
                entry={entry}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function lastValidValue<T extends { value: number | null }>(
  data: readonly T[],
): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i].value;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function firstValidValue<T extends { value: number | null }>(
  data: readonly T[],
): number | null {
  for (let i = 0; i < data.length; i++) {
    const v = data[i].value;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

const ENERGY_LABELS = [
  "",
  "Виснажений",
  "Втомлений",
  "Нормально",
  "Добре",
  "Відмінно",
];
const MOOD_LABELS = [
  "",
  "Пригнічений",
  "Поганий",
  "Нейтральний",
  "Гарний",
  "Чудовий",
];

function ScoreButton({ value, selected, onClick, label }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-[background-color,border-color,color,opacity]",
        selected
          ? "bg-success-strong text-white border-success-strong"
          : "border-line text-subtle hover:border-success/50 hover:text-text",
      )}
      aria-pressed={selected}
      title={label}
    >
      <span className="text-base leading-none">{value}</span>
      <span
        className={cn(
          "text-2xs leading-none truncate max-w-full px-1",
          selected ? "text-white/80" : "text-muted",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function Body({ onOpenMeasurements }) {
  const { entries, addEntry, deleteEntry, restoreEntry, recentWith } =
    useDailyLog();
  const toast = useToast();
  const handleDeleteJournalEntry = useCallback(
    (id) => {
      const snapshot = entries.find((e) => e.id === id);
      if (!snapshot) return;
      deleteEntry(id);
      showUndoToast(toast, {
        msg: "Запис журналу видалено",
        onUndo: () => restoreEntry(snapshot),
      });
    },
    [entries, deleteEntry, restoreEntry, toast],
  );

  const [form, setForm] = useState({
    weightKg: "",
    sleepHours: "",
    energyLevel: null,
    moodScore: null,
    note: "",
  });
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const submitSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (submitSuccessTimerRef.current) {
        clearTimeout(submitSuccessTimerRef.current);
        submitSuccessTimerRef.current = null;
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const entry = {
      weightKg: form.weightKg !== "" ? Number(form.weightKg) : null,
      sleepHours: form.sleepHours !== "" ? Number(form.sleepHours) : null,
      energyLevel: form.energyLevel,
      moodScore: form.moodScore,
      note: form.note.trim(),
    };
    addEntry(entry);
    setForm({
      weightKg: "",
      sleepHours: "",
      energyLevel: null,
      moodScore: null,
      note: "",
    });
    setSubmitSuccess(true);
    if (submitSuccessTimerRef.current) {
      clearTimeout(submitSuccessTimerRef.current);
    }
    submitSuccessTimerRef.current = setTimeout(() => {
      setSubmitSuccess(false);
      submitSuccessTimerRef.current = null;
    }, 2000);
  };

  const weightData = useMemo(() => {
    const recent = recentWith("weightKg", 30);
    return recent
      .slice()
      .reverse()
      .map((e) => ({
        value: e.weightKg,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [recentWith]);

  const sleepData = useMemo(() => {
    const recent = recentWith("sleepHours", 20);
    return recent
      .slice()
      .reverse()
      .map((e) => ({
        value: e.sleepHours,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [recentWith]);

  const energyData = useMemo(() => {
    const recent = recentWith("energyLevel", 20);
    return recent
      .slice()
      .reverse()
      .map((e) => ({
        value: e.energyLevel,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [recentWith]);

  const moodData = useMemo(() => {
    const recent = recentWith("moodScore", 20);
    return recent
      .slice()
      .reverse()
      .map((e) => ({
        value: e.moodScore,
        label: new Date(e.at).toLocaleDateString("uk-UA", {
          day: "numeric",
          month: "short",
        }),
      }));
  }, [recentWith]);

  const stats = useMemo(() => {
    const wEntries = recentWith("weightKg", 7);
    const sEntries = recentWith("sleepHours", 7);
    const eEntries = recentWith("energyLevel", 7);
    const avgSleep =
      sEntries.length > 0
        ? sEntries.reduce((s, e) => s + (e.sleepHours || 0), 0) /
          sEntries.length
        : null;
    const avgEnergy =
      eEntries.length > 0
        ? eEntries.reduce((s, e) => s + (e.energyLevel || 0), 0) /
          eEntries.length
        : null;
    const latestWeight = wEntries[0]?.weightKg ?? null;
    return { latestWeight, avgSleep, avgEnergy };
  }, [recentWith]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-text">Тіло</h1>
            <p className="text-xs text-subtle mt-0.5">
              Вага · сон · самопочуття
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-xs text-subtle">Вага</div>
              <div className="text-base font-extrabold text-text tabular-nums">
                {stats.latestWeight != null ? `${stats.latestWeight} кг` : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-subtle">Сон</div>
              <div className="text-base font-extrabold text-text tabular-nums">
                {stats.avgSleep != null
                  ? `${stats.avgSleep.toFixed(1)} г`
                  : "—"}
              </div>
            </div>
            {onOpenMeasurements && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onOpenMeasurements}
                className="text-xs font-semibold text-subtle hover:text-text"
              >
                Виміри
              </Button>
            )}
          </div>
        </div>

        <Card as="section" radius="lg" aria-label="Записати показники">
          <SectionHeading as="h2" size="sm" className="mb-3">
            Записати сьогодні
          </SectionHeading>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="body-weight">Вага (кг)</Label>
                <input
                  id="body-weight"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="20"
                  max="300"
                  className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                  placeholder="70.5"
                  value={form.weightKg}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weightKg: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="body-sleep">Сон (год)</Label>
                <input
                  id="body-sleep"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  max="24"
                  className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                  placeholder="8.0"
                  value={form.sleepHours}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sleepHours: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <SectionHeading as="p" size="xs" className="mb-2">
                Рівень енергії
              </SectionHeading>
              <div
                className="flex gap-1.5"
                role="group"
                aria-label="Рівень енергії"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <ScoreButton
                    key={v}
                    value={v}
                    label={ENERGY_LABELS[v]}
                    selected={form.energyLevel === v}
                    onClick={(val) =>
                      setForm((f) => ({
                        ...f,
                        energyLevel: f.energyLevel === val ? null : val,
                      }))
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <SectionHeading as="p" size="xs" className="mb-2">
                Настрій
              </SectionHeading>
              <div className="flex gap-1.5" role="group" aria-label="Настрій">
                {[1, 2, 3, 4, 5].map((v) => (
                  <ScoreButton
                    key={v}
                    value={v}
                    label={MOOD_LABELS[v]}
                    selected={form.moodScore === v}
                    onClick={(val) =>
                      setForm((f) => ({
                        ...f,
                        moodScore: f.moodScore === val ? null : val,
                      }))
                    }
                  />
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="body-note" optional>
                Нотатка
              </Label>
              <input
                id="body-note"
                type="text"
                className="input-focus-fizruk w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text"
                placeholder="Як почуваєшся сьогодні…"
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                maxLength={200}
              />
            </div>

            <button
              type="submit"
              className={cn(
                "focus-ring w-full py-3 rounded-xl font-semibold text-sm transition-[background-color,box-shadow,opacity,transform]",
                submitSuccess
                  ? "bg-success-strong text-white"
                  : "bg-success-strong text-white active:scale-[0.98]",
              )}
            >
              {submitSuccess ? "Записано ✓" : "Записати"}
            </button>
          </form>
        </Card>

        {(
          [
            {
              storageKey: "weight",
              title: "Динаміка ваги",
              ariaLabel: "Динаміка ваги",
              data: weightData,
              unit: "кг",
              color: "rgb(22 163 74)",
              metricLabel: "вагу",
            },
            {
              storageKey: "sleep",
              title: "Сон",
              ariaLabel: "Динаміка сну",
              data: sleepData,
              unit: "год",
              color: "rgb(99 102 241)",
              metricLabel: "сон",
            },
            {
              storageKey: "energy",
              title: "Рівень енергії",
              ariaLabel: "Динаміка енергії",
              data: energyData,
              unit: "/5",
              color: "rgb(245 158 11)",
              metricLabel: "рівень енергії",
            },
            {
              storageKey: "mood",
              title: "Настрій",
              ariaLabel: "Динаміка настрою",
              data: moodData,
              unit: "/5",
              color: "rgb(236 72 153)",
              metricLabel: "настрій",
            },
          ] as const
        )
          .filter((card) => card.data.length >= 2)
          .map((card) => {
            const latest = lastValidValue(card.data);
            const first = firstValidValue(card.data);
            const delta =
              latest != null && first != null ? latest - first : null;
            return (
              <CollapsibleTrendCard
                key={card.storageKey}
                storageKey={card.storageKey}
                title={card.title}
                ariaLabel={card.ariaLabel}
                latestValue={latest}
                latestUnit={card.unit}
                delta={delta}
              >
                <MiniLineChart
                  data={card.data}
                  unit={card.unit}
                  color={card.color}
                  metricLabel={card.metricLabel}
                />
              </CollapsibleTrendCard>
            );
          })}

        {entries.length > 0 && (
          <JournalSection
            entries={entries.slice(0, 15)}
            totalCount={entries.length}
            onDelete={handleDeleteJournalEntry}
          />
        )}
      </div>
    </div>
  );
}
