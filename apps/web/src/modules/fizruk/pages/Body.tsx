import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Label } from "@shared/components/ui/FormField";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/cn";
import { useDailyLog } from "../hooks/useDailyLog";
import { Card } from "@shared/components/ui/Card";
import { MiniLineChart } from "../components/MiniLineChart";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import { CollapsibleTrendCard } from "./Body/CollapsibleTrendCard";
import { JournalSection } from "./Body/JournalSection";
import { ENERGY_LABELS, MOOD_LABELS, ScoreButton } from "./Body/ScoreButton";
import { firstValidValue, lastValidValue } from "./Body/trendUtils";

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
interface BodyProps {
  onOpenMeasurements?: () => void;
}

interface BodyForm {
  weightKg: string;
  sleepHours: string;
  energyLevel: number | null;
  moodScore: number | null;
  note: string;
}

export function Body({ onOpenMeasurements }: BodyProps) {
  const { entries, addEntry, deleteEntry, restoreEntry, recentWith } =
    useDailyLog();
  const toast = useToast();
  const handleDeleteJournalEntry = useCallback(
    (id: string) => {
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

  const [form, setForm] = useState<BodyForm>({
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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
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
            <h1 className="text-style-title text-text">Тіло</h1>
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
                className="text-style-caption text-subtle hover:text-text"
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
                    onClick={(val: number) =>
                      setForm((f: BodyForm) => ({
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
                    onClick={(val: number) =>
                      setForm((f: BodyForm) => ({
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
                "focus-ring w-full py-3 rounded-xl text-style-label transition-[background-color,box-shadow,opacity,transform]",
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
