import { useCallback, useMemo } from "react";
import { messages } from "@shared/i18n/uk";
import { InjuryManager } from "../components/InjuryManager";
import {
  buildBodyWeightSeries,
  selectLatestBodyWeight,
} from "@sergeant/fizruk-domain";
import { useDailyLog } from "../hooks/useDailyLog";
import { useMeasurements } from "../hooks/useMeasurements";
import { Card } from "@shared/components/ui/Card";
import { Measure } from "@shared/components/ui/Measure";
import { MiniLineChart } from "../components/MiniLineChart";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { BodyEntryForm, type BodyEntryDraft } from "./Body/BodyEntryForm";
import { CollapsibleTrendCard } from "./Body/CollapsibleTrendCard";
import { JournalSection } from "./Body/JournalSection";
import { firstValidValue, lastValidValue } from "./Body/trendUtils";
import { RecoveryFocusCard } from "../components/RecoveryFocusCard";
import { safeRemoveLS } from "@shared/lib/storage/storage";
import { JOURNAL_ENTRY_OPEN_PREFIX } from "./Body/storage";
import { chartStatusSeries, chartSeries, chartPalette } from "@shared/charts";

// Модуль фізичного щоденника: форма запису + графіки динаміки + журнал.
interface BodyProps {
  /** Navigates the shell to the Atlas silhouette page (passed in by the router to avoid hash coupling). */
  onOpenAtlas?: () => void;
}

// Форма запису живе в `./Body/BodyEntryForm` (Hard Rule #18 — сторінка була
// над лімітом 600 рядків). Re-export лишає стару публічну поверхню модуля.
export { hasAnyBodyEntryValue } from "./Body/BodyEntryForm";

/** Скільки останніх точок показує графік ваги (день = одна точка). */
const WEIGHT_TREND_POINTS = 30;

export function Body({ onOpenAtlas }: BodyProps) {
  const { entries, addEntry, deleteEntry, restoreEntry, recentWith } =
    useDailyLog();
  // W1-WEIGHT-SOT стадія 1: вага живе у ДВОХ сховищах (`fizruk_daily_log` +
  // `fizruk_measurements`), і екран «Тіло» історично читав лише перше — тому
  // зважування з екрана «Заміри» тут не зʼявлялося. Читаємо union обох через
  // доменний селектор; сторінка нічого не пише інакше.
  const { entries: measurementEntries } = useMeasurements();
  const toast = useToast();
  const handleDeleteJournalEntry = useCallback(
    (id: string) => {
      const snapshot = entries.find((e) => e.id === id);
      if (!snapshot) return;
      // Remove the per-entry open-state key so it doesn't accumulate as an orphan after deletion.
      safeRemoveLS(JOURNAL_ENTRY_OPEN_PREFIX + id);
      deleteEntry(id);
      showUndoToast(toast, {
        msg: "Запис журналу видалено",
        onUndo: () => restoreEntry(snapshot),
      });
    },
    [entries, deleteEntry, restoreEntry, toast],
  );

  const handleSubmitEntry = useCallback(
    (draft: BodyEntryDraft) => {
      addEntry({
        weightKg: draft.weightKg,
        sleepHours: draft.sleepHours,
        energyLevel: draft.energyLevel,
        moodScore: draft.moodScore,
        note: draft.note,
      });
    },
    [addEntry],
  );

  const weightData = useMemo(
    () =>
      buildBodyWeightSeries(
        entries,
        measurementEntries,
        WEIGHT_TREND_POINTS,
      ).map((p) => ({ value: p.value, label: p.label })),
    [entries, measurementEntries],
  );

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
    const latestWeight =
      selectLatestBodyWeight(entries, measurementEntries)?.weightKg ?? null;
    return { latestWeight, avgSleep, avgEnergy };
  }, [recentWith, entries, measurementEntries]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-style-title text-text">
              {messages.fizruk.body.title}
            </h1>
            <p className="text-style-caption text-subtle mt-0.5">
              {messages.fizruk.body.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              {/* AI-CONTEXT: роль `caption`, а не `label`. Та сама роль,
                  що дає `SectionHeading size="xs"` у `Stat` і `MacroChip`
                  для мітки НАД числом — але без смужки-кікера: у тісній
                  смузі з трьох центрованих колонок вона читалась би як
                  зайва графіка. Розмір не змінюється (12px → 12px). */}
              <div className="text-style-caption text-subtle">
                {messages.fizruk.body.weight}
              </div>
              {}
              <div className="text-base font-extrabold text-text tabular-nums">
                {stats.latestWeight != null ? (
                  <Measure
                    value={stats.latestWeight}
                    unit={messages.fizruk.body.kgUnit}
                    fractionDigits={1}
                  />
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-style-caption text-subtle">
                {messages.fizruk.body.sleep}
              </div>
              {}
              <div className="text-base font-extrabold text-text tabular-nums">
                {/* `toFixed(1)` давав КРАПКУ («7.5 год») посеред
                    інтерфейсу, де всюди кома. `Measure` бере роздільник
                    із локалі — та сама дрібниця, з якої складається П4. */}
                {stats.avgSleep != null ? (
                  <Measure
                    value={stats.avgSleep}
                    unit={messages.fizruk.body.hoursUnit}
                    fractionDigits={1}
                  />
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-style-caption text-subtle">
                {messages.fizruk.body.energyShort}
              </div>
              {}
              <div className="text-base font-extrabold text-text tabular-nums">
                {/* Defect #8: computed 7-day average energy already lived
                    in `stats` but never rendered anywhere on the page —
                    third column, same treatment as weight/sleep above. */}
                {stats.avgEnergy != null ? (
                  <Measure
                    value={stats.avgEnergy}
                    unit="/5"
                    fractionDigits={1}
                  />
                ) : (
                  "—"
                )}
              </div>
            </div>
          </div>
        </div>

        {/*
          V-10 (fizruk deep audit, 2026-08-07): «Відновлення й фокус» — ключова
          фіча модуля (канон fizruk §4) — раніше рендерилась ПІСЛЯ форми
          запису і за замовчуванням згорнутою, тож на «своїй» сторінці
          програвала пріоритет вводу даних. Тепер вона стоїть першою і
          відкрита одразу (`RecoveryFocusCard` default `open=true`); форма
          запису лишається розгорнутою нижче — це швидкий щоденний ритуал
          (вага/сон/енергія за секунди), а не другорядна дія, тож ховати її
          за додатковим кліком сенсу не має.
        */}
        {onOpenAtlas && <RecoveryFocusCard onOpenAtlas={onOpenAtlas} />}

        <BodyEntryForm onSubmitEntry={handleSubmitEntry} />

        <InjuryManager />

        {(
          [
            {
              storageKey: "weight",
              title: "Динаміка ваги",
              ariaLabel: "Динаміка ваги",
              data: weightData,
              unit: "кг",
              color: chartStatusSeries.success,
              metricLabel: "вагу",
              // Fizruk-канон: модуль не задає дефолтну ціль по вазі — ні
              // зростання, ні зниження саме по собі не «краще». Нейтральний
              // тон, а не success/warning в будь-який бік.
              deltaDirection: "neutral",
            },
            {
              storageKey: "sleep",
              title: "Сон",
              ariaLabel: "Динаміка сну",
              data: sleepData,
              unit: "год",
              color: chartSeries.fizruk.primary as string,
              metricLabel: "сон",
              deltaDirection: "up-is-good",
            },
            {
              storageKey: "energy",
              title: "Рівень енергії",
              ariaLabel: "Динаміка енергії",
              data: energyData,
              unit: "/5",
              color: chartStatusSeries.warning,
              metricLabel: "рівень енергії",
              deltaDirection: "up-is-good",
            },
            {
              storageKey: "mood",
              title: "Настрій",
              ariaLabel: "Динаміка настрою",
              data: moodData,
              unit: "/5",
              color: chartPalette[8] as string,
              metricLabel: "настрій",
              deltaDirection: "up-is-good",
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
                deltaDirection={card.deltaDirection}
              >
                <MiniLineChart
                  data={card.data}
                  unit={card.unit}
                  color={card.color}
                  metricLabel={card.metricLabel}
                  deltaDirection={card.deltaDirection}
                />
              </CollapsibleTrendCard>
            );
          })}

        {[weightData, sleepData, energyData, moodData].every(
          (d) => d.length < 2,
        ) && (
          <Card radius="lg" padding="lg">
            {/* Defect #5: `aria-label` on a generic `<div>` (no ARIA role)
                is dropped by AT and flagged by axe (`aria-prohibited-attr`).
                The label text is already the visible first paragraph below —
                removing it loses nothing, screen readers read the text. */}
            <p className="text-style-label text-text">
              {messages.fizruk.body.trendsCollecting}
            </p>
            <p className="text-style-caption text-subtle mt-1">
              {messages.fizruk.body.trendsCollectingDescription}
            </p>
          </Card>
        )}

        {entries.length > 0 && (
          <JournalSection
            entries={entries}
            onDelete={handleDeleteJournalEntry}
          />
        )}
      </div>
    </div>
  );
}
