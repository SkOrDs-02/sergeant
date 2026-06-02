import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type {
  Budget,
  GoalBudget,
  LimitBudget,
} from "@sergeant/finyk-domain/domain";
import {
  validateGoalBudgetForm,
  validateLimitBudgetForm,
} from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

const GOAL_EMOJIS = [
  "🎯",
  "🏠",
  "🚗",
  "✈️",
  "💻",
  "📱",
  "💍",
  "🎓",
  "🏋️",
  "💰",
];

export interface AddBudgetSheetProps {
  open: boolean;
  onClose: () => void;
  /** Existing budgets — used by limit validator to dedupe categories. */
  existingBudgets: Budget[];
  /** Expense categories shown in the limit form picker. */
  categories: { id: string; label: string }[];
  onAdd: (budget: Budget) => void;
  testID?: string;
}

interface FormState {
  type: "limit" | "goal";
  categoryId: string;
  limit: string;
  name: string;
  emoji: string;
  targetAmount: string;
  savedAmount: string;
  targetDate: string;
}

const EMPTY: FormState = {
  type: "limit",
  categoryId: "",
  limit: "",
  name: "",
  emoji: "🎯",
  targetAmount: "",
  savedAmount: "",
  targetDate: "",
};

function makeId(): string {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddBudgetSheet({
  open,
  onClose,
  existingBudgets,
  categories,
  onAdd,
  testID,
}: AddBudgetSheetProps) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setError(null);
  }, [open]);

  const handleSubmit = () => {
    if (form.type === "limit") {
      const res = validateLimitBudgetForm(
        { categoryId: form.categoryId, limit: form.limit, type: "limit" },
        existingBudgets,
      );
      if (res.error || !res.normalized) {
        setError(res.error);
        return;
      }
      const limitBudget: LimitBudget = {
        id: makeId(),
        type: "limit",
        categoryId: res.normalized.categoryId ?? form.categoryId,
        limit: res.normalized.limit,
        ...(res.normalized.label != null
          ? { label: res.normalized.label as string }
          : {}),
      };
      onAdd(limitBudget);
    } else {
      const res = validateGoalBudgetForm({
        name: form.name,
        targetAmount: form.targetAmount,
        savedAmount: form.savedAmount || 0,
        type: "goal",
      });
      if (res.error || !res.normalized) {
        setError(res.error);
        return;
      }
      const goalBudget: GoalBudget = {
        id: makeId(),
        type: "goal",
        name: res.normalized.name ?? form.name,
        targetAmount: res.normalized.targetAmount,
        savedAmount: res.normalized.savedAmount,
        ...(form.emoji ? { emoji: form.emoji } : {}),
        ...(form.targetDate ? { targetDate: form.targetDate } : {}),
      };
      onAdd(goalBudget);
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Новий бюджет"
      footer={
        <View className="flex-row gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onPress={onClose}
            testID={testID ? `${testID}-cancel` : undefined}
          >
            Скасувати
          </Button>
          <Button
            variant="finyk"
            className="flex-1"
            onPress={handleSubmit}
            testID={testID ? `${testID}-submit` : undefined}
          >
            Додати
          </Button>
        </View>
      }
    >
      <View testID={testID}>
        <View className="flex-row gap-2 mb-4">
          <Pressable
            onPress={() => setForm((f) => ({ ...f, type: "limit" }))}
            accessibilityRole="button"
            accessibilityState={{ selected: form.type === "limit" }}
            testID={testID ? `${testID}-type-limit` : undefined}
            className={
              form.type === "limit"
                ? "flex-1 py-2 rounded-xl border border-brand-500 bg-brand-500 items-center"
                : "flex-1 py-2 rounded-xl border border-cream-300 items-center"
            }
          >
            <Text
              className={
                form.type === "limit"
                  ? "text-sm font-semibold text-white"
                  : "text-sm font-semibold text-fg"
              }
            >
              🔴 Ліміт
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setForm((f) => ({ ...f, type: "goal" }))}
            accessibilityRole="button"
            accessibilityState={{ selected: form.type === "goal" }}
            testID={testID ? `${testID}-type-goal` : undefined}
            className={
              form.type === "goal"
                ? "flex-1 py-2 rounded-xl border border-emerald-600 bg-emerald-600 items-center"
                : "flex-1 py-2 rounded-xl border border-cream-300 items-center"
            }
          >
            <Text
              className={
                form.type === "goal"
                  ? "text-sm font-semibold text-white"
                  : "text-sm font-semibold text-fg"
              }
            >
              🟢 Ціль
            </Text>
          </Pressable>
        </View>

        {form.type === "limit" ? (
          <>
            <Text className="text-sm font-medium text-fg mb-1">Категорія</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-1 mb-3"
              contentContainerStyle={{ paddingHorizontal: 4 }}
            >
              {categories
                .filter((c) => c.id !== "income" && c.id !== "in_other")
                .map((c) => {
                  const selected = form.categoryId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() =>
                        setForm((f) => ({ ...f, categoryId: c.id }))
                      }
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      testID={testID ? `${testID}-cat-${c.id}` : undefined}
                      className={
                        selected
                          ? "bg-brand-500 border border-brand-500 rounded-full px-3 h-9 mr-2 justify-center"
                          : "bg-cream-50 border border-cream-300 rounded-full px-3 h-9 mr-2 justify-center"
                      }
                    >
                      <Text
                        className={
                          selected
                            ? "text-white text-sm font-medium"
                            : "text-fg text-sm font-medium"
                        }
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>
            <Text className="text-sm font-medium text-fg mb-1">Ліміт ₴</Text>
            <Input
              value={form.limit}
              onChangeText={(v) => setForm((f) => ({ ...f, limit: v }))}
              type="number"
              placeholder="0"
              testID={testID ? `${testID}-limit` : undefined}
            />
          </>
        ) : (
          <>
            <Text className="text-sm font-medium text-fg mb-1">Іконка</Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {GOAL_EMOJIS.map((e) => {
                const selected = form.emoji === e;
                return (
                  <Pressable
                    key={e}
                    onPress={() => setForm((f) => ({ ...f, emoji: e }))}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={
                      selected
                        ? "px-2 py-1 rounded-lg border border-brand-500 bg-brand-50"
                        : "px-2 py-1 rounded-lg border border-transparent"
                    }
                  >
                    <Text className="text-xl">{e}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-sm font-medium text-fg mb-1">Назва цілі</Text>
            <Input
              value={form.name}
              onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Накопичити на…"
              testID={testID ? `${testID}-name` : undefined}
            />
            <View className="h-2" />
            <Text className="text-sm font-medium text-fg mb-1">
              Сума цілі ₴
            </Text>
            <Input
              value={form.targetAmount}
              onChangeText={(v) => setForm((f) => ({ ...f, targetAmount: v }))}
              type="number"
              placeholder="0"
              testID={testID ? `${testID}-target` : undefined}
            />
            <View className="h-2" />
            <Text className="text-sm font-medium text-fg mb-1">
              Вже відкладено ₴
            </Text>
            <Input
              value={form.savedAmount}
              onChangeText={(v) => setForm((f) => ({ ...f, savedAmount: v }))}
              type="number"
              placeholder="0"
            />
            <View className="h-2" />
            <Text className="text-sm font-medium text-fg mb-1">
              Дата (YYYY-MM-DD)
            </Text>
            <Input
              value={form.targetDate}
              onChangeText={(v) => setForm((f) => ({ ...f, targetDate: v }))}
              placeholder="2026-12-31"
            />
          </>
        )}

        {error ? (
          <Text className="text-xs text-danger mt-3">{error}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
