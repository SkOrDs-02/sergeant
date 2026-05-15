/**
 * Finyk — ManualExpenseSheet (React Native)
 *
 * Mobile port of
 * `apps/web/src/modules/finyk/components/ManualExpenseSheet.tsx`.
 *
 * **Scope of this PR (PR3):** the core "5-second add" flow — amount,
 * category picker, optional description, optional date — wired into
 * the shared `Sheet` primitive. The web component layers voice
 * dictation, personalised suggestion pills, recurring-detection, and
 * receipt attachment on top of this shell; those will land as
 * follow-up screens / PRs so this file stays focused on the happy
 * path and can anchor the first Detox E2E suite.
 *
 * The `onSave` payload shape matches the web file exactly so upstream
 * consumers (Finyk storage / cloud-sync queue) can be reused once
 * PR4 lands.
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

// Category list must stay aligned with the web component — Finyk
// storage and analytics key off these exact labels (`MANUAL_CATEGORY_ID_MAP`).
export const MANUAL_EXPENSE_CATEGORIES = [
  "🍴 їжа",
  "🛍 продукти",
  "🍔 кафе та ресторани",
  "🚗 транспорт",
  "🎮 розваги",
  "💊 здоров'я",
  "🛍️ покупки",
  "🏠 комунальні",
  "📱 техніка",
  "🎵 підписки",
  "📚 навчання",
  "✈️ подорожі",
  "🏷 інше",
] as const;

export type ManualExpenseCategory = (typeof MANUAL_EXPENSE_CATEGORIES)[number];

const DEFAULT_CATEGORY: ManualExpenseCategory = "🏷 інше";

// Legacy labels (pre-emoji). Mirrors the upgrade table from the web
// component so saved expenses round-trip cleanly between platforms.
const LEGACY_CATEGORY_UPGRADE: Record<string, ManualExpenseCategory> = {
  їжа: "🍴 їжа",
  транспорт: "🚗 транспорт",
  розваги: "🎮 розваги",
  "здоров'я": "💊 здоров'я",
  одяг: "🛍️ покупки",
  комунальні: "🏠 комунальні",
  техніка: "📱 техніка",
  інше: "🏷 інше",
};

export function upgradeCategory(raw: string | undefined): ManualExpenseCategory {
  if (!raw) return DEFAULT_CATEGORY;
  if ((MANUAL_EXPENSE_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as ManualExpenseCategory;
  }
  return LEGACY_CATEGORY_UPGRADE[raw] ?? DEFAULT_CATEGORY;
}

// Strips leading emoji / punctuation so "🍴 їжа" → "їжа". Used as the
// fallback description when the user leaves the field blank.
function stripEmoji(label: string): string {
  const str = String(label || "");
  let i = 0;
  while (i < str.length && !/[\p{L}\p{N}]/u.test(str[i] ?? "")) i++;
  return str.slice(i).trim();
}

function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface ManualExpenseInput {
  id?: string | number;
  description?: string;
  amount?: number;
  category?: string;
  date?: string | number | Date;
}

export interface ManualExpensePayload {
  id?: string;
  description: string;
  amount: number;
  category: ManualExpenseCategory;
  date: string;
}

export interface ManualExpenseSheetProps {
  open: boolean;
  onClose: () => void;
  onSave?: (payload: ManualExpensePayload) => void;
  /**
   * Surfaced as a "Видалити" action when editing an existing manual
   * expense. Receives the existing id; caller is responsible for
   * confirming the destructive action.
   */
  onDelete?: (id: string) => void;
  initialExpense?: ManualExpenseInput | null;
  initialCategory?: string;
  initialDescription?: string;
  /**
   * `testID` for the sheet root. Propagates to the primary action so
   * Detox can key a "Save" tap off a stable selector.
   */
  testID?: string;
}

export function ManualExpenseSheet({
  open,
  onClose,
  onSave,
  onDelete,
  initialExpense,
  initialCategory,
  initialDescription,
  testID,
}: ManualExpenseSheetProps) {
  const isEditing = !!initialExpense?.id;

  const initialDate = useMemo(() => {
    if (initialExpense?.date) {
      const d = new Date(initialExpense.date);
      if (!Number.isNaN(d.getTime())) return toLocalISODate(d);
    }
    return toLocalISODate(new Date());
  }, [initialExpense?.date]);

  const [description, setDescription] = useState(
    initialExpense?.description ?? initialDescription ?? "",
  );
  const [amount, setAmount] = useState(
    initialExpense?.amount != null ? String(initialExpense.amount) : "",
  );
  const [category, setCategory] = useState<ManualExpenseCategory>(
    upgradeCategory(initialExpense?.category ?? initialCategory),
  );
  const [date, setDate] = useState(initialDate);
  const [error, setError] = useState<string | null>(null);

  // When the sheet is re-opened with a different row (e.g. user taps
  // "edit" on a second manual expense) we must pick up the new initial
  // state. Reset once per `open` transition.
  useEffect(() => {
    if (!open) return;
    setDescription(initialExpense?.description ?? initialDescription ?? "");
    setAmount(
      initialExpense?.amount != null ? String(initialExpense.amount) : "",
    );
    setCategory(upgradeCategory(initialExpense?.category ?? initialCategory));
    setDate(initialDate);
    setError(null);
  }, [
    open,
    initialDate,
    initialExpense?.amount,
    initialExpense?.category,
    initialExpense?.description,
    initialCategory,
    initialDescription,
  ]);

  const handleSubmit = () => {
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || Number.isNaN(amt) || amt <= 0) {
      setError("Вкажіть суму більше 0");
      return;
    }
    const trimmedDesc = description.trim();
    const finalDescription = trimmedDesc || stripEmoji(category);
    const isoDate = date
      ? new Date(`${date}T12:00:00`).toISOString()
      : new Date().toISOString();

    onSave?.({
      ...(initialExpense?.id ? { id: String(initialExpense.id) } : {}),
      description: finalDescription,
      amount: amt,
      category,
      date: isoDate,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати витрату" : "Додати витрату"}
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
              {isEditing ? "Зберегти" : "Додати"}
            </Button>
          </View>
          {isEditing && onDelete && initialExpense?.id ? (
            <Button
              variant="ghost"
              className="self-stretch"
              onPress={() => {
                onDelete(String(initialExpense.id));
                onClose();
              }}
              testID={testID ? `${testID}-delete` : undefined}
            >
              <Text className="text-danger text-sm font-semibold">
                🗑 Видалити
              </Text>
            </Button>
          ) : null}
        </View>
      }
    >
      <View className="px-4 pb-4" testID={testID}>
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Сума ₴</Text>
          <Input
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              if (error) setError(null);
            }}
            placeholder="0"
            type="number"
            size="lg"
            testID={testID ? `${testID}-amount` : undefined}
            accessibilityLabel="Сума витрати"
          />
          {error ? (
            <Text className="text-xs text-danger mt-1">{error}</Text>
          ) : null}
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Категорія</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-1"
            contentContainerStyle={{ paddingHorizontal: 4 }}
          >
            {MANUAL_EXPENSE_CATEGORIES.map((c) => {
              const selected = c === category;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={
                    testID
                      ? `${testID}-category-${stripEmoji(c).replace(/\s+/g, "-")}`
                      : undefined
                  }
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
                    {c}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Опис</Text>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder="Напр.: обід, таксі, квитки"
            size="md"
            testID={testID ? `${testID}-description` : undefined}
          />
        </View>

        <View className="mb-2">
          <Text className="text-sm font-medium text-fg mb-1">Дата</Text>
          <Input
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            size="md"
            testID={testID ? `${testID}-date` : undefined}
            accessibilityLabel="Дата витрати"
          />
        </View>
      </View>
    </Sheet>
  );
}
