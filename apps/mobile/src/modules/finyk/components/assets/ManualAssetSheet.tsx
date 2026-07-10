/**
 * Finyk — Manual Asset create/edit sheet (React Native).
 *
 * Mirrors the inline add-asset form on the web (`apps/web/src/modules/
 * finyk/pages/Assets.tsx`, `newAsset` state + "+ Додати актив" branch).
 * Ported into the shared `Sheet` primitive so mobile gets the same
 * bottom-sheet affordance used by every other form (Habits, …).
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import type { ManualAsset } from "@sergeant/finyk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface ManualAssetSheetProps {
  open: boolean;
  onClose: () => void;
  /** Existing asset when editing; `null` => create. */
  asset: ManualAsset | null;
  onSubmit: (next: ManualAsset) => void;
  onDelete?: (id: string) => void;
  testID?: string;
}

interface DraftState {
  name: string;
  emoji: string;
  amount: string;
  currency: string;
}

const EMPTY_DRAFT: DraftState = {
  name: "",
  emoji: "💰",
  amount: "",
  currency: "UAH",
};

function toDraft(asset: ManualAsset | null): DraftState {
  if (!asset) return { ...EMPTY_DRAFT };
  return {
    name: asset.name,
    emoji: asset.emoji || "💰",
    amount: String(asset.amount ?? ""),
    currency: asset.currency || "UAH",
  };
}

export function ManualAssetSheet({
  open,
  onClose,
  asset,
  onSubmit,
  onDelete,
  testID,
}: ManualAssetSheetProps) {
  const [draft, setDraft] = useState<DraftState>(() => toDraft(asset));
  const [nameError, setNameError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(toDraft(asset));
      setNameError(false);
      setAmountError(false);
    }
  }

  const isEditing = !!asset;

  function handleSubmit() {
    const name = draft.name.trim();
    const amountNum = Number(draft.amount);
    const invalidName = !name;
    const invalidAmount = !Number.isFinite(amountNum);
    if (invalidName || invalidAmount) {
      setNameError(invalidName);
      setAmountError(invalidAmount);
      return;
    }
    const next: ManualAsset = {
      id: asset?.id ?? `${Date.now()}`,
      name,
      emoji: draft.emoji || "💰",
      amount: amountNum,
      currency: draft.currency || "UAH",
    };
    onSubmit(next);
    onClose();
  }

  function handleDelete() {
    if (asset && onDelete) {
      onDelete(asset.id);
      onClose();
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати актив" : "Новий актив"}
      description="Готівка, брокерський рахунок, крипта тощо."
      footer={
        <View className="flex-row gap-2">
          {isEditing && onDelete ? (
            <Button
              variant="danger"
              size="md"
              onPress={handleDelete}
              accessibilityLabel="Видалити актив"
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
          <Text
            className="text-xs font-medium text-fg mb-1"
            nativeID={testID ? `${testID}-name-label` : undefined}
          >
            Назва
          </Text>
          <Input
            placeholder="Готівка, брокер, крипта…"
            value={draft.name}
            onChangeText={(t) => setDraft((d) => ({ ...d, name: t }))}
            error={nameError}
            aria-labelledby={testID ? `${testID}-name-label` : undefined}
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
            <Text className="text-xs font-medium text-fg mb-1">Сума</Text>
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
          <Text className="text-xs font-medium text-fg mb-1">Валюта</Text>
          <View className="flex-row gap-2">
            {(["UAH", "USD", "EUR"] as const).map((c) => {
              const active = draft.currency === c;
              return (
                <Pressable
                  key={c}
                  onPress={() => setDraft((d) => ({ ...d, currency: c }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={testID ? `${testID}-currency-${c}` : undefined}
                  className={
                    active
                      ? "h-9 px-3 rounded-lg bg-brand-500 items-center justify-center"
                      : "h-9 px-3 rounded-lg bg-cream-100 border border-cream-300 items-center justify-center"
                  }
                >
                  <Text
                    className={
                      active
                        ? "text-sm font-medium text-white"
                        : "text-sm font-medium text-fg"
                    }
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Sheet>
  );
}

export default ManualAssetSheet;
