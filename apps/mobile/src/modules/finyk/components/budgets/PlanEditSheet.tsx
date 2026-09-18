import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

import type { MonthlyPlanInput } from "@/modules/finyk/lib/budgetsStore";

export interface PlanEditSheetProps {
  open: boolean;
  onClose: () => void;
  initial: MonthlyPlanInput;
  onSubmit: (next: MonthlyPlanInput) => void;
  testID?: string;
}

function asStr(v: string | number | undefined): string {
  if (v == null) return "";
  return typeof v === "number" ? String(v) : v;
}

export function PlanEditSheet({
  open,
  onClose,
  initial,
  onSubmit,
  testID,
}: PlanEditSheetProps) {
  const [income, setIncome] = useState(asStr(initial.income));
  const [expense, setExpense] = useState(asStr(initial.expense));
  const [savings, setSavings] = useState(asStr(initial.savings));
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setIncome(asStr(initial.income));
      setExpense(asStr(initial.expense));
      setSavings(asStr(initial.savings));
    }
  }

  const handleSubmit = () => {
    onSubmit({ income, expense, savings });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Місячний план"
      description="Заплануй очікувані доходи, витрати й накопичення."
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
            Зберегти
          </Button>
        </View>
      }
    >
      <View testID={testID}>
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">
            План доходу ₴
          </Text>
          <Input
            value={income}
            onChangeText={setIncome}
            type="number"
            placeholder="0"
            testID={testID ? `${testID}-income` : undefined}
          />
        </View>
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">
            План витрат ₴
          </Text>
          <Input
            value={expense}
            onChangeText={setExpense}
            type="number"
            placeholder="0"
            testID={testID ? `${testID}-expense` : undefined}
          />
        </View>
        <View className="mb-2">
          <Text className="text-sm font-medium text-fg mb-1">
            План накопичень ₴
          </Text>
          <Input
            value={savings}
            onChangeText={setSavings}
            type="number"
            placeholder="0"
            testID={testID ? `${testID}-savings` : undefined}
          />
        </View>
      </View>
    </Sheet>
  );
}
