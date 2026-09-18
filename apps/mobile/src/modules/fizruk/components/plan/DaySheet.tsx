/**
 * `DaySheet` — вміст нижнього Sheet для `PlanCalendar`. Показує:
 *   1. Панель відновлення (якщо є forecast).
 *   2. Список запланованих тренувань (якщо є).
 *   3. Ряди вибору шаблону (включно з рядком «Без плану»).
 * Чисто презентаційний; мутації делегуються батьківському компоненту.
 */
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  describeDayRecovery,
  type DayRecoveryForecast,
  type DayRecoveryStatus,
  type PlannedWorkoutLike,
} from "@sergeant/fizruk-domain/domain/plan/index";
import type { WorkoutTemplate } from "@sergeant/fizruk-domain/domain/types";

/** Tailwind background colour for a recovery dot (duplicated from parent to
 *  keep this component self-contained and avoid a shared util file). */
function recoveryDotClass(
  status: DayRecoveryStatus | null | undefined,
): string {
  switch (status) {
    case "overworked":
      return "bg-red-500";
    case "ready":
      return "bg-emerald-500";
    case "fresh":
      return "bg-line";
    default:
      return "";
  }
}

function formatTime(startedAt: string | null | undefined): string | null {
  if (!startedAt) return null;
  try {
    return new Date(startedAt).toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export interface DaySheetProps {
  /** Currently selected templateId for the day (null = no template). */
  templateId: string | null;
  /** Planned workouts for the day. */
  planned: readonly PlannedWorkoutLike[];
  /** Recovery forecast for the day (null if unavailable). */
  forecast: DayRecoveryForecast | null;
  /** All known workout templates for the template picker. */
  templates: readonly WorkoutTemplate[];
  /** Called when the user picks a template (null = clear / "no plan"). */
  onApply: (templateId: string | null) => void;
}

function DaySheetImpl({
  templateId,
  planned,
  forecast,
  templates,
  onApply,
}: DaySheetProps) {
  return (
    <View className="gap-3">
      {/* Recovery forecast panel */}
      {forecast ? (
        <View
          testID={`plan-recovery-summary-${forecast.status}`}
          accessibilityLabel={describeDayRecovery(forecast)}
          className={`rounded-xl border px-3 py-2 ${
            forecast.status === "overworked"
              ? "border-red-200 bg-red-50"
              : forecast.status === "ready"
                ? "border-emerald-200 bg-emerald-50"
                : "border-line bg-bg"
          }`}
        >
          <View className="flex-row items-center gap-2 mb-1">
            <View
              className={`w-2 h-2 rounded-full ${recoveryDotClass(
                forecast.status,
              )}`}
            />
            <Text className="text-xs font-bold text-fg">
              {forecast.status === "overworked"
                ? "Відновлення: перевантаження"
                : forecast.status === "ready"
                  ? "Відновлення: готовий"
                  : "Відновлення: без недавніх тренувань"}
            </Text>
          </View>
          {forecast.overworkedMuscles.length > 0 ? (
            <Text className="text-xs text-fg-muted leading-snug">
              Перевантажені:{" "}
              {forecast.overworkedMuscles.map((m) => m.label).join(", ")}
            </Text>
          ) : null}
          {forecast.recoveredMuscles.length > 0 ? (
            <Text className="text-xs text-fg-muted leading-snug">
              Відновлені:{" "}
              {forecast.recoveredMuscles.map((m) => m.label).join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Planned workouts list */}
      {planned.length > 0 ? (
        <View>
          <Text className="text-xs font-bold text-emerald-700 mb-2">
            🏋 Заплановані тренування
          </Text>
          <View className="gap-2">
            {planned.map((w) => {
              const time = formatTime(
                typeof w.startedAt === "string" ? w.startedAt : null,
              );
              const itemNames = Array.isArray(w.items)
                ? w.items
                    .map((it) => {
                      const rec = it as {
                        nameUk?: unknown;
                        name?: unknown;
                      };
                      if (typeof rec.nameUk === "string") return rec.nameUk;
                      if (typeof rec.name === "string") return rec.name;
                      return null;
                    })
                    .filter((x): x is string => !!x)
                : [];
              return (
                <View
                  key={w.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <Text className="text-sm font-semibold text-fg">
                    {time ? (
                      <Text className="text-emerald-700">{time} </Text>
                    ) : null}
                    {typeof w.note === "string" && w.note
                      ? w.note
                      : "Тренування"}
                  </Text>
                  {itemNames.length > 0 ? (
                    <Text className="text-xs text-fg-muted mt-0.5">
                      {itemNames.join(" · ")}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Template picker */}
      <View>
        <Text className="text-xs text-fg-muted mb-2">Шаблон тренування</Text>
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Без плану"
            onPress={() => onApply(null)}
            className={`px-3 py-3 rounded-xl border ${
              !templateId ? "border-emerald-500 bg-emerald-50" : "border-line"
            }`}
          >
            <Text className="text-sm text-fg">Без плану (вихідний)</Text>
          </Pressable>
          {templates.map((t) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={t.name}
              onPress={() => onApply(t.id)}
              className={`px-3 py-3 rounded-xl border ${
                templateId === t.id
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-line"
              }`}
            >
              <Text className="text-sm text-fg">{t.name}</Text>
            </Pressable>
          ))}
        </View>
        {templates.length === 0 ? (
          <Text className="text-xs text-fg-muted mt-2">
            Спочатку створи шаблон у «Тренування → Шаблони».
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const DaySheet = memo(DaySheetImpl);
