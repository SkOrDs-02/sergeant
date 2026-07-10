/**
 * Finyk — Debt (я винен) create/edit sheet (React Native).
 *
 * Mirrors the inline debt form from the web Assets page. `totalAmount`
 * + base `amount` stay in sync (the web file treats them as aliases
 * for the original principal) so the domain helpers
 * (`calcDebtRemaining`, `getDebtEffectiveTotal`) read consistent data.
 */

import { useState } from "react";
import { Text, View } from "react-native";

import type { AssetsDebt } from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface DebtSheetProps {
  open: boolean;
  onClose: () => void;
  debt: AssetsDebt | null;
  onSubmit: (next: AssetsDebt) => void;
  onDelete?: (id: string) => void;
  testID?: string;
}

interface DraftState {
  name: string;
  emoji: string;
  amount: string;
  note: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  emoji: "💸",
  amount: "",
  note: "",
};

function toDraft(debt: AssetsDebt | null): DraftState {
  if (!debt) return { ...EMPTY_DRAFT };
  return {
    name: debt.name || "",
    emoji: debt.emoji || "💸",
    amount: String(debt.totalAmount ?? debt.amount ?? ""),
    note: debt.note || "",
  };
}

export function DebtSheet({
  open,
  onClose,
  debt,
  onSubmit,
  onDelete,
  testID,
}: DebtSheetProps) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(debt));
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(toDraft(debt));
      setNameError(false);
      setAmountError(false);
    }
  }

  const isEditing = !!debt;

  function handleSubmit() {
    const name = draft.name.trim();
    const total = Number(draft.amount);
    const invalidName = !name;
    const invalidAmount = !Number.isFinite(total) || total <= 0;
    if (invalidName || invalidAmount) {
      setNameError(invalidName);
      setAmountError(invalidAmount);
      return;
    }
    const next: AssetsDebt = {
      ...(debt ?? {}),
      id: debt?.id ?? `${Date.now()}`,
      name,
      emoji: draft.emoji || "💸",
      amount: total,
      totalAmount: total,
      note: draft.note,
      linkedTxIds: debt?.linkedTxIds ?? [],
    };
    onSubmit(next);
    onClose();
  }

  function handleDelete() {
    if (debt && onDelete) {
      onDelete(debt.id);
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати борг" : "Новий борг"}
      description="Скільки ти винен — повна сума."
      footer={
        <View className="flex-row gap-2">
          {isEditing && onDelete ? (
            <Button
              variant="danger"
              size="md"
              onPress={handleDelete}
              testID={testID ? `${testID}-delete` : undefined}
            >
              Видалити
            </Button>
          ) : null}
          <View className="flex-1" />
          <Button
            variant="secondary"
            size="md"
            onPress={onClose}
            testID={testID ? `${testID}-cancel` : undefined}
          >
            Скасувати
          </Button>
          <Button
            variant="finyk"
            size="md"
            onPress={handleSubmit}
            testID={testID ? `${testID}-submit` : undefined}
          >
            {isEditing ? "Зберегти" : "Додати"}
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <View>
          <Text className="text-xs font-medium text-fg mb-1">Назва</Text>
          <Input
            placeholder="Кому / за що"
            value={draft.name}
            onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))}
            error={nameError}
            testID={testID ? `${testID}-name` : undefined}
          />
        </View>
        <View className="flex-row gap-3">
          <View className="w-24">
            <Text className="text-xs font-medium text-fg mb-1">Емодзі</Text>
            <Input
              value={draft.emoji}
              onChangeText={(t) => setDraft((d) => ({ ...d, emoji: t }))}
              maxLength={2}
              testID={testID ? `${testID}-emoji` : undefined}
            />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-medium text-fg mb-1">Сума, ₴</Text>
            <Input
              placeholder="0"
              type="number"
              value={draft.amount}
              onChangeText={(t) => setDraft((d) => ({ ...d, amount: t }))}
              error={amountError}
              testID={testID ? `${testID}-amount` : undefined}
            />
          </View>
        </View>
        <View>
          <Text className="text-xs font-medium text-fg mb-1">Нотатка</Text>
          <Input
            placeholder="Необов'язково"
            value={draft.note}
            onChangeText={(t) => setDraft((d) => ({ ...d, note: t }))}
            testID={testID ? `${testID}-note` : undefined}
          />
        </View>
      </View>
    </Sheet>
  );
}

export default DebtSheet;
