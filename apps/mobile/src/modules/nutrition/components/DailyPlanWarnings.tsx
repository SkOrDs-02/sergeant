/**
 * Mobile port of `apps/web/src/modules/nutrition/components/DailyPlanWarnings.tsx`.
 *
 * Pure-логіку (`calcMacroKcalMismatch`, `calcGoalRangeIssues`,
 * `GOAL_BOUNDS`) тягне з `@sergeant/nutrition-domain` — той самий
 * модуль, що web. Локалізовані повідомлення дублюються інлайн —
 * apps/mobile зараз не має i18n-словника, цей файл лишається єдиним
 * UA source-of-truth для warnings, доки не з'явиться спільний
 * mobile-словник.
 */
import { Pressable, Text, View } from "react-native";

import {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
  type GoalRangeIssue,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";

export type UpdatePrefs = (patch: Partial<NutritionPrefs>) => void;

const GOAL_RANGE_MESSAGES: Record<
  GoalRangeIssue["field"],
  Record<GoalRangeIssue["kind"], string>
> = {
  kcal: {
    low: "Менше 800 ккал — небезпечно без нагляду лікаря.",
    high: "Більше 6000 ккал — це дуже багато навіть для атлетів.",
  },
  protein_g: {
    low: "Менше 30 г білка — ризик дефіциту.",
    high: "Більше 300 г білка — це дуже багато навіть для атлетів.",
  },
  fat_g: {
    low: "Менше 20 г жиру — ризик дефіциту незамінних жирних кислот.",
    high: "Більше 250 г жиру — це дуже багато для типового раціону.",
  },
  carbs_g: {
    low: "",
    high: "Більше 700 г вуглеводів — це дуже багато навіть для атлетів.",
  },
};

interface MacroKcalWarningProps {
  prefs: NutritionPrefs;
  updatePrefs: UpdatePrefs;
  busy?: boolean;
}

export function MacroKcalWarning({
  prefs,
  updatePrefs,
  busy,
}: MacroKcalWarningProps) {
  const mismatch = calcMacroKcalMismatch(prefs);
  if (!mismatch) return null;

  const { kind, target, calc, diff } = mismatch;
  const absDiff = Math.abs(diff);
  const overshoot = kind === "over";

  const tone = overshoot
    ? "border-danger/40 bg-danger-soft"
    : "border-warning/40 bg-warning-soft";

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="macro-kcal-warning"
      className={`mt-3 rounded-xl border px-3 py-2.5 ${tone}`}
      style={{ gap: 8 }}
    >
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <Text
          className={`font-bold ${overshoot ? "text-danger-strong" : "text-warning-strong"}`}
          aria-hidden
        >
          {overshoot ? "⚠" : "ℹ"}
        </Text>
        <Text className="flex-1 text-xs leading-5 text-fg">
          {overshoot ? (
            <>
              Сума макро виходить на{" "}
              <Text className="font-bold">{calc} ккал</Text> — це на{" "}
              <Text className="font-bold">{absDiff} ккал</Text> більше за ціль{" "}
              <Text className="font-bold">{target} ккал</Text>. 1 г білка = 4
              ккал, 1 г жиру = 9 ккал, 1 г вуглеводів = 4 ккал.
            </>
          ) : (
            <>
              Сума макро дає лише <Text className="font-bold">{calc} ккал</Text>{" "}
              — це на <Text className="font-bold">{absDiff} ккал</Text> менше за
              ціль <Text className="font-bold">{target} ккал</Text>.
            </>
          )}
        </Text>
      </View>
      <View className="flex-row flex-wrap pl-5" style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => updatePrefs({ dailyTargetKcal: calc })}
          testID="macro-kcal-warning-recalc"
          className="flex-row items-center rounded-xl border border-line bg-panel px-2 py-1"
          style={{ gap: 4, opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-xs text-fg">Перерахувати ккал → {calc}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            updatePrefs({
              dailyTargetProtein_g: null,
              dailyTargetFat_g: null,
              dailyTargetCarbs_g: null,
            })
          }
          testID="macro-kcal-warning-reset-macros"
          className="flex-row items-center rounded-xl border border-line bg-panelHi px-2 py-1"
          style={{ gap: 4, opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-xs text-fg-muted">Скинути макро</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface MissingMacrosHintProps {
  prefs: NutritionPrefs;
  updatePrefs: UpdatePrefs;
  busy?: boolean;
}

/**
 * UX-roast §3.3 — м'яка підказка з пропозицією середніх макросів
 * коли користувач задав ккал, але макро ще немає. Сплит 30/25/45 від
 * заданих ккал → грами (білок і жир округлюємо вниз, вуглеводи
 * добираємо залишком ккал щоб сума не перевищила ціль).
 */
export function MissingMacrosHint({
  prefs,
  updatePrefs,
  busy,
}: MissingMacrosHintProps) {
  const kcal = prefs.dailyTargetKcal ?? 0;
  if (kcal <= 0) return null;
  const hasAnyMacro =
    (prefs.dailyTargetProtein_g ?? 0) > 0 ||
    (prefs.dailyTargetFat_g ?? 0) > 0 ||
    (prefs.dailyTargetCarbs_g ?? 0) > 0;
  if (hasAnyMacro) return null;

  const suggestedProtein = Math.floor((kcal * 0.3) / 4);
  const suggestedFat = Math.floor((kcal * 0.25) / 9);
  const remainingKcal = kcal - suggestedProtein * 4 - suggestedFat * 9;
  const suggestedCarbs = Math.max(0, Math.floor(remainingKcal / 4));

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="missing-macros-hint"
      className="mt-3 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5"
      style={{ gap: 8 }}
    >
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <Text className="font-bold text-warning-strong" aria-hidden>
          ℹ
        </Text>
        <Text className="flex-1 text-xs leading-5 text-fg">
          Задано лише <Text className="font-bold">{kcal} ккал</Text>, але без
          макро AI не зрозуміє що тобі важливо — білок, жир чи вуглеводи.
          Підстав середні стартові значення й відредагуй під себе.
        </Text>
      </View>
      <View className="flex-row flex-wrap pl-5" style={{ gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            updatePrefs({
              dailyTargetProtein_g: suggestedProtein,
              dailyTargetFat_g: suggestedFat,
              dailyTargetCarbs_g: suggestedCarbs,
            })
          }
          testID="missing-macros-hint-apply"
          className="flex-row items-center rounded-xl border border-line bg-panel px-2 py-1"
          style={{ gap: 4, opacity: busy ? 0.5 : 1 }}
        >
          <Text className="text-xs text-fg">
            Підставити середні · Б{suggestedProtein} · Ж{suggestedFat} · В
            {suggestedCarbs}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function GoalRangeWarning({ prefs }: { prefs: NutritionPrefs }) {
  const issues = calcGoalRangeIssues(prefs);
  if (issues.length === 0) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="goal-range-warning"
      className="mt-3 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5"
      style={{ gap: 4 }}
    >
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <Text className="font-bold text-warning-strong" aria-hidden>
          ⚠
        </Text>
        <View className="flex-1" style={{ gap: 2 }}>
          {issues.map((issue) => (
            <Text
              key={`${issue.field}-${issue.kind}`}
              className="text-xs leading-5 text-fg"
            >
              {"• "}
              {GOAL_RANGE_MESSAGES[issue.field][issue.kind]}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
