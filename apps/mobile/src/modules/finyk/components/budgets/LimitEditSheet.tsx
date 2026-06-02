import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { Budget, LimitBudget } from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface LimitEditSheetProps {
  open: boolean;
  onClose: () => void;
  budget: LimitBudget | null;
  categoryLabel: string;
  onSubmit: (next: Budget) => void;
  onDelete: (id: string) => void;
  testID?: string;
}

export function LimitEditSheet({
  open,
  onClose,
  budget,
  categoryLabel,
  onSubmit,
  onDelete,
  testID,
}: LimitEditSheetProps) {
  const [limit, setLimit] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !budget) return;
    setLimit(String(budget.limit ?? ""));
    setError(null);
  }, [open, budget]);

  if (!budget) return null;

  const handleSubmit = () => {
    const v = Number(limit);
    if (!limit || Number.isNaN(v) || v <= 0) {
      setError("Вкажіть ліміт більше 0");
      return;
    }
    onSubmit({ ...budget, limit: v });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Редагувати ліміт"
      description={categoryLabel}
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
              🗑 Видалити ліміт
            </Text>
          </Button>
        </View>
      }
    >
      <View testID={testID}>
        <Text className="text-sm font-medium text-fg mb-1">Ліміт ₴</Text>
        <Input
          value={limit}
          onChangeText={(v) => {
            setLimit(v);
            if (error) setError(null);
          }}
          type="number"
          placeholder="0"
          testID={testID ? `${testID}-amount` : undefined}
        />
        {error ? (
          <Text className="text-xs text-danger mt-1">{error}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
