import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { GoalBudget } from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export type { GoalBudget };

export interface GoalEditSheetProps {
  open: boolean;
  onClose: () => void;
  budget: GoalBudget | null;
  onSubmit: (next: GoalBudget) => void;
  onDelete: (id: string) => void;
  testID?: string;
}

export function GoalEditSheet({
  open,
  onClose,
  budget,
  onSubmit,
  onDelete,
  testID,
}: GoalEditSheetProps) {
  const [saved, setSaved] = useState("");
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !budget) return;
    setSaved(String(budget.savedAmount ?? ""));
    setTarget(String(budget.targetAmount ?? ""));
    setName(budget.name ?? "");
    setDate(budget.targetDate ?? "");
    setError(null);
  }, [open, budget]);

  if (!budget) return null;

  const handleSubmit = () => {
    const t = Number(target);
    const s = Number(saved || 0);
    if (!name.trim()) {
      setError("Вкажіть назву цілі");
      return;
    }
    if (!target || Number.isNaN(t) || t <= 0) {
      setError("Вкажіть суму цілі більше 0");
      return;
    }
    if (s < 0) {
      setError("Відкладена сума не може бути від'ємною");
      return;
    }
    onSubmit({
      ...budget,
      name: name.trim(),
      targetAmount: t,
      savedAmount: s,
      targetDate: date || undefined,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Редагувати ціль"
      footer={
        <View className="gap-2">
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
              Зберегти
            </Button>
          </View>
          <Button
            variant="ghost"
            onPress={() => {
              onDelete(String(budget.id));
              onClose();
            }}
            testID={testID ? `${testID}-delete` : undefined}
          >
            <Text className="text-danger text-sm font-semibold">
              🗑 Видалити ціль
            </Text>
          </Button>
        </View>
      }
    >
      <View testID={testID}>
        <View className="mb-3">
          <Text className="text-sm font-medium text-fg mb-1">Назва цілі</Text>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Накопичити на…"
          />
        </View>
        <View className="mb-3">
          <Text className="text-sm font-medium text-fg mb-1">Сума цілі ₴</Text>
          <Input
            value={target}
            onChangeText={setTarget}
            type="number"
            placeholder="0"
            testID={testID ? `${testID}-target` : undefined}
          />
        </View>
        <View className="mb-3">
          <Text className="text-sm font-medium text-fg mb-1">
            Вже відкладено ₴
          </Text>
          <Input
            value={saved}
            onChangeText={setSaved}
            type="number"
            placeholder="0"
            testID={testID ? `${testID}-saved` : undefined}
          />
        </View>
        <View className="mb-2">
          <Text className="text-sm font-medium text-fg mb-1">
            Дата (YYYY-MM-DD)
          </Text>
          <Input value={date} onChangeText={setDate} placeholder="2026-12-31" />
        </View>
        {error ? (
          <Text className="text-xs text-danger mt-1">{error}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
