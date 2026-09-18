/**
 * `ExerciseHistoryList` — newest-first list of sets / sessions for a
 * single exercise. Renders at most `limit` (default 20) entries with
 * a short uk-UA date, a type badge and a one-line summary per row.
 */
import type { ExerciseHistoryEntry } from "@sergeant/fizruk-domain/domain";
import { memo } from "react";
import { Text, View } from "react-native";

export interface ExerciseHistoryListProps {
  history: readonly ExerciseHistoryEntry[];
  /** Max rows to render; defaults to 20 — matches web. */
  limit?: number;
  /** Optional root testID. */
  testID?: string;
}

function formatHistoryDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString("uk-UA", {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function describeEntry(entry: ExerciseHistoryEntry): string {
  const item = entry.item;
  if (item?.type === "strength") {
    const sets = Array.isArray(item.sets) ? item.sets : [];
    if (sets.length === 0) return "—";
    return sets.map((s) => `${s?.weightKg ?? 0}×${s?.reps ?? 0}`).join(", ");
  }
  if (item?.type === "distance") {
    const dist = Number(item.distanceM) || 0;
    const dur = Number(item.durationSec) || 0;
    const base = `${dist} м за ${dur} с`;
    if (dist > 0 && dur > 0) {
      const distKm = dist / 1000;
      const paceMinKm = dur / 60 / distKm;
      let pm = Math.floor(paceMinKm);
      let ps = Math.round((paceMinKm - pm) * 60);
      if (ps >= 60) {
        pm += 1;
        ps = 0;
      }
      const speed = (distKm / (dur / 3600)).toFixed(1);
      return `${base} · ${pm}:${String(ps).padStart(2, "0")} хв/км · ${speed} км/год`;
    }
    return base;
  }
  if (item?.type === "time") {
    return `${Number(item.durationSec) || 0} с`;
  }
  return "—";
}

function entryTypeLabel(entry: ExerciseHistoryEntry): string {
  const t = entry.item?.type;
  if (t === "strength") return "силова";
  if (t === "distance") return "дистанція";
  if (t === "time") return "час";
  return "—";
}

const ExerciseHistoryListImpl = function ExerciseHistoryList({
  history,
  limit = 20,
  testID = "fizruk-exercise-history",
}: ExerciseHistoryListProps) {
  if (history.length === 0) {
    return (
      <View
        testID={`${testID}-empty`}
        className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 p-4"
      >
        <Text className="text-sm font-semibold text-fg">
          Поки немає записів
        </Text>
        <Text className="text-xs text-fg-muted mt-1">
          Заверши хоча б один підхід, історія зʼявиться тут.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2" testID={testID}>
      {history.slice(0, limit).map((entry) => {
        const { workout, item } = entry;
        const key = `${workout.id}_${item.id}`;
        return (
          <View
            key={key}
            className="border border-cream-300 rounded-2xl p-3 bg-cream-50"
            testID={`${testID}-row-${key}`}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-xs text-fg-muted">
                {formatHistoryDate(workout?.startedAt)}
              </Text>
              <View className="px-2 py-0.5 rounded-full border border-cream-300">
                <Text className="text-[10px] text-fg-muted">
                  {entryTypeLabel(entry)}
                </Text>
              </View>
            </View>
            <Text className="text-sm text-fg mt-2">{describeEntry(entry)}</Text>
          </View>
        );
      })}
    </View>
  );
};

export const ExerciseHistoryList = memo(ExerciseHistoryListImpl);
