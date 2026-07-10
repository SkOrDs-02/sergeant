import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

import type { Subscription } from "@/modules/finyk/lib/budgetsStore";

const EMOJIS = ["📦", "🎬", "🎵", "▶️", "📱", "☁️", "🤖", "📧", "📸", "🛒"];
const CURRENCIES = ["UAH", "USD", "EUR"];

export interface SubscriptionEditSheetProps {
  open: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  onSubmit: (sub: Subscription) => void;
  onDelete: (id: string) => void;
  testID?: string;
}

function makeId(): string {
  return `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const EMPTY: Subscription = {
  id: "",
  name: "",
  emoji: "📦",
  keyword: "",
  billingDay: 1,
  currency: "UAH",
};

export function SubscriptionEditSheet({
  open,
  onClose,
  subscription,
  onSubmit,
  onDelete,
  testID,
}: SubscriptionEditSheetProps) {
  const [form, setForm] = useState<Subscription>(() =>
    open ? (subscription ?? EMPTY) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const isEditing = !!subscription?.id;
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(subscription ?? EMPTY);
      setError(null);
    }
  }

  const handleSubmit = () => {
    if (!form.name.trim()) {
      setError("Вкажіть назву підписки");
      return;
    }
    const day = Number(form.billingDay);
    if (!day || day < 1 || day > 31) {
      setError("День оплати: 1–31");
      return;
    }
    onSubmit({
      ...form,
      id: form.id || makeId(),
      name: form.name.trim(),
      billingDay: day,
    });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати підписку" : "Нова підписка"}
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
          {isEditing && subscription ? (
            <Button
              variant="ghost"
              onPress={() => {
                onDelete(subscription.id);
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
      <View testID={testID}>
        <Text className="text-sm font-medium text-fg mb-1">Іконка</Text>
        <View className="flex-row flex-wrap gap-2 mb-3">
          {EMOJIS.map((e) => {
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

        <Text className="text-sm font-medium text-fg mb-1">Назва</Text>
        <Input
          value={form.name}
          onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="Netflix"
          testID={testID ? `${testID}-name` : undefined}
        />
        <View className="h-2" />

        <Text className="text-sm font-medium text-fg mb-1">
          Ключове слово (для авто-пошуку)
        </Text>
        <Input
          value={form.keyword}
          onChangeText={(v) => setForm((f) => ({ ...f, keyword: v }))}
          placeholder="netflix"
        />
        <View className="h-2" />

        <Text className="text-sm font-medium text-fg mb-1">День оплати</Text>
        <Input
          value={String(form.billingDay)}
          onChangeText={(v) =>
            setForm((f) => ({ ...f, billingDay: Number(v) || 0 }))
          }
          type="number"
          placeholder="1"
          testID={testID ? `${testID}-day` : undefined}
        />
        <View className="h-2" />

        <Text className="text-sm font-medium text-fg mb-1">Валюта</Text>
        <View className="flex-row gap-2 mb-3">
          {CURRENCIES.map((c) => {
            const selected = form.currency === c;
            return (
              <Pressable
                key={c}
                onPress={() => setForm((f) => ({ ...f, currency: c }))}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={
                  selected
                    ? "px-3 py-1.5 rounded-full border border-brand-500 bg-brand-50"
                    : "px-3 py-1.5 rounded-full border border-cream-300"
                }
              >
                <Text className="text-sm font-medium text-fg">{c}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="text-sm font-medium text-fg mb-1">
          Очікувана сума (опц.)
        </Text>
        <Input
          value={form.monthlyCost != null ? String(form.monthlyCost) : ""}
          onChangeText={(v) =>
            setForm((f) => ({
              ...f,
              monthlyCost: v ? Number(v) : undefined,
            }))
          }
          type="number"
          placeholder="0"
        />

        {error ? (
          <Text className="text-xs text-danger mt-3">{error}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
