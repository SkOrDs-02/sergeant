import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  getGoalQuestions,
  hapticTap,
  type DashboardModuleId,
  type OnboardingGoals,
} from "@sergeant/shared";

import { Button } from "@/components/ui/Button";

import { cx } from "./style";

const GOAL_KEY_MAP: Record<string, keyof OnboardingGoals> = {
  finyk_budget: "finykBudget",
  fizruk_weekly: "fizrukWeeklyGoal",
  routine_first_habit: "routineFirstHabit",
  nutrition_goal: "nutritionGoal",
};

export function GoalsStep({
  picks,
  goals,
  onSetGoal,
  onFinish,
  onBack,
}: {
  picks: DashboardModuleId[];
  goals: OnboardingGoals;
  onSetGoal: (key: keyof OnboardingGoals, value: unknown) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const questions = useMemo(() => getGoalQuestions(picks), [picks]);
  const hasQuestions = questions.length > 0;

  return (
    <View className="items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-center text-xl font-bold text-fg">
          {hasQuestions ? "Твої цілі" : "Готово!"}
        </Text>
        <Text className="text-center text-xs text-fg-muted">
          {hasQuestions
            ? "Необов'язково — можна пропустити."
            : "Налаштуй деталі потім у кожному модулі."}
        </Text>
      </View>

      {hasQuestions && (
        <View className="w-full gap-4">
          {questions.map((q) => {
            const goalKey = GOAL_KEY_MAP[q.id];
            if (!goalKey) return null;
            if (q.type === "radio" && q.options) {
              const currentVal = (goals[goalKey] as string | null) ?? null;
              return (
                <View key={q.id} className="gap-1.5">
                  <Text className="text-sm font-semibold text-fg">
                    {q.title}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          hapticTap();
                          onSetGoal(
                            goalKey,
                            q.id === "fizruk_weekly"
                              ? Number(opt.value)
                              : opt.value,
                          );
                        }}
                        className={cx(
                          "rounded-xl border px-3.5 py-2",
                          "active:opacity-70",
                          currentVal === opt.value ||
                            (q.id === "fizruk_weekly" &&
                              goals[goalKey] === Number(opt.value))
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-cream-300 bg-cream-50",
                        )}
                      >
                        <Text className="text-sm font-medium text-fg">
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            }
            if (q.type === "slider" && q.slider) {
              const currentNum = (goals[goalKey] as number | null) ?? null;
              const s = q.slider;
              const presets = [
                s.min,
                Math.round((s.min + s.max) / 3),
                Math.round(((s.min + s.max) * 2) / 3),
                s.max,
              ];
              return (
                <View key={q.id} className="gap-1.5">
                  <Text className="text-sm font-semibold text-fg">
                    {q.title}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {presets.map((preset) => (
                      <Pressable
                        key={preset}
                        onPress={() => {
                          hapticTap();
                          onSetGoal(goalKey, preset);
                        }}
                        className={cx(
                          "rounded-xl border px-3.5 py-2",
                          "active:opacity-70",
                          currentNum === preset
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-cream-300 bg-cream-50",
                        )}
                      >
                        <Text className="text-sm font-medium text-fg">
                          {preset.toLocaleString("uk-UA")}
                          {s.unit ? ` ${s.unit}` : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            }
            return null;
          })}
        </View>
      )}

      <View className="w-full flex-row gap-2">
        <Pressable
          onPress={onBack}
          className="items-center justify-center rounded-xl px-4 py-3 active:opacity-70"
          testID="onboarding-back-goals"
        >
          <Text className="text-sm text-fg-muted">←</Text>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onPress={onFinish}
          testID="onboarding-finish"
          className="flex-1"
        >
          Заповни мій хаб
        </Button>
      </View>
    </View>
  );
}
