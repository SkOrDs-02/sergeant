/**
 * Finyk — Receivable (мені винні) create/edit sheet (React Native).
 *
 * Sibling of `DebtSheet` — receivables store their principal in the
 * base `amount` field (see `packages/finyk-domain/src/domain/debtEngine.ts`),
 * so only the field mapping differs.
 */

import { useState } from "react";
import { Text, View } from "react-native";

import type { AssetsReceivable } from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface ReceivableSheetProps {
  open: boolean;
  onClose: () => void;
  receivable: AssetsReceivable | null;
  onSubmit: (next: AssetsReceivable) => void;
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
  emoji: "👤",
  amount: "",
  note: "",
};

function toDraft(recv: AssetsReceivable | null): DraftState {
  if (!recv) return { ...EMPTY_DRAFT };
  return {
    name: recv.name || "",
    emoji: recv.emoji || "👤",
    amount: String(recv.amount ?? ""),
    note: recv.note || "",
  };
}

export function ReceivableSheet({
  open,
  onClose,
  receivable,
  onSubmit,
  onDelete,
  testID,
}: ReceivableSheetProps) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(receivable));
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(toDraft(receivable));
      setNameError(false);
      setAmountError(false);
    }
  }

  const isEditing = !!receivable;

  function handleSubmit() {
    const name = draft.name.trim();
    const amount = Number(draft.amount);
    const invalidName = !name;
    const invalidAmount = !Number.isFinite(amount) || amount <= 0;
    if (invalidName || invalidAmount) {
      setNameError(invalidName);
      setAmountError(invalidAmount);
      return;
    }
    const next: AssetsReceivable = {
      ...(receivable ?? {}),
      id: receivable?.id ?? `${Date.now()}`,
      name,
      emoji: draft.emoji || "👤",
      amount,
      note: draft.note,
      linkedTxIds: receivable?.linkedTxIds ?? [],
    };
    onSubmit(next);
    onClose();
  }

  function handleDelete() {
    if (receivable && onDelete) {
      onDelete(receivable.id);
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати дебіторку" : "Нова дебіторка"}
      description="Скільки тобі винні."
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
          <Text className="text-xs font-medium text-fg mb-1">Хто винен</Text>
          <Input
            placeholder="Ім'я або назва"
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

export default ReceivableSheet;
