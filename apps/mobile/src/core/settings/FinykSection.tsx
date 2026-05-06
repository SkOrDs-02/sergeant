/**
 * Sergeant Hub-core — FinykSection (React Native, first cut)
 *
 * Mobile mirror of `apps/web/src/core/settings/FinykSection.tsx`.
 *
 * Within-reach parity (does the real thing now):
 *  - "Власні категорії витрат" — input + "Додати" + список із
 *    "Видалити" кнопкою біля кожної. Персистимо у MMKV під
 *    `STORAGE_KEYS.FINYK_CUSTOM_CATS` (`finyk_custom_cats_v1`) —
 *    ЙДЕ тим самим cloud-sync-конвертом, що й web, бо ключ
 *    `FINYK_CUSTOM_CATS` уже входить у `cloudSync/config.ts`
 *    webʼу. Shape `[{ id, label }]` ідентичний web-варіанту
 *    (`apps/web/src/modules/finyk/hooks/useStorage.ts`).
 *    Видалення — через `ConfirmDialog`, щоб не зʼєсти запис
 *    випадковим тапом (аналог `AttentionModal` + fade у web).
 *
 * Deferred (див. `docs/mobile/react-native-migration.md` Phase 2 /
 * Hub-core, §2.4) — рендериться як `DeferredNotice`-карточка:
 *  - **Monobank: статус, очистка кешу, disconnect.** Web читає
 *    `finyk_info_cache` + `finyk_token` (одне підʼєднане через
 *    OAuth-flow Фініка). Mobile ще не має власного Monobank-флоу
 *    (Phase 4+ — інтеграції/токени), тому секція тут — плейсхолдер
 *    із поясненням, що підключиться разом із портом модуля Фінік.
 *  - **Рахунки (сховати/показати).** Залежить від `finyk_info_cache`
 *    з того самого Monobank-флоу — плейсхолдер з тим самим
 *    обґрунтуванням.
 *  - **Privat24.** На web `PRIVAT_ENABLED = false`, тобто й там
 *    секція прихована. Ніякого UI для неї не портуємо.
 */

import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { STORAGE_KEYS } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { useLocalStorage } from "@/lib/storage";

import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

interface CustomCategory {
  id: string;
  label: string;
}

const CUSTOM_CATS_KEY = STORAGE_KEYS.FINYK_CUSTOM_CATS;
const MAX_LABEL_LENGTH = 80;

function makeCategoryId(): string {
  // `Math.random().toString(36)` is good enough for a local-only id —
  // mirrors the web `useStorage` hook that also seeds its ids from
  // `crypto.randomUUID()` + fallback. We keep it simple here to avoid
  // pulling in `expo-crypto` for a sub-categorical affordance.
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c_${ts}_${rand}`;
}

function DeferredNotice({ children }: { children: string }) {
  return (
    <Card variant="flat" radius="md" padding="md" className="border-dashed">
      <Text className="text-xs text-fg-muted leading-snug">{children}</Text>
    </Card>
  );
}

export function FinykSection() {
  const [customCategories, setCustomCategories] = useLocalStorage<
    CustomCategory[]
  >(CUSTOM_CATS_KEY, []);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const trimmedLabel = newCategoryLabel.trim();
  const canAdd = trimmedLabel.length > 0;

  const addCategory = () => {
    if (!canAdd) return;
    const label = trimmedLabel.slice(0, MAX_LABEL_LENGTH);
    setCustomCategories((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return [...list, { id: makeCategoryId(), label }];
    });
    setNewCategoryLabel("");
  };

  const confirmRemove = () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setCustomCategories((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.filter((c) => c.id !== id);
    });
    setPendingDeleteId(null);
  };

  const pendingLabel = pendingDeleteId
    ? (customCategories.find((c) => c.id === pendingDeleteId)?.label ?? "")
    : "";

  return (
    <SettingsGroup title="Фінік" emoji="💳">
      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Видалити категорію?"
        description={
          pendingLabel
            ? `«${pendingLabel}» більше не зʼявлятиметься у списку категорій.`
            : "Категорію буде видалено з списку."
        }
        confirmLabel="Видалити"
        danger
        onConfirm={confirmRemove}
        onCancel={() => setPendingDeleteId(null)}
      />

      <SettingsSubGroup title="Власні категорії витрат">
        <Text className="text-xs text-fg-muted leading-snug">
          Додаються до списку категорій у транзакціях, сплітах і лімітах (можна
          вказати емодзі на початку назви).
        </Text>
        <View className="flex-row gap-2 items-stretch">
          <Input
            value={newCategoryLabel}
            onChangeText={setNewCategoryLabel}
            placeholder="Напр. 🎨 Хобі"
            maxLength={MAX_LABEL_LENGTH}
            returnKeyType="done"
            onSubmitEditing={addCategory}
            containerClassName="flex-1"
            testID="finyk-custom-cat-input"
          />
          <Button
            onPress={addCategory}
            disabled={!canAdd}
            variant="finyk"
            testID="finyk-custom-cat-add"
          >
            Додати
          </Button>
        </View>
        {customCategories.length > 0 ? (
          <FlatList
            data={customCategories}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            // The outer ScrollView already owns scrolling; this list is
            // only here for the styled row separators + keyExtractor.
            renderItem={({ item, index }) => (
              <View
                className={`flex-row items-center justify-between gap-2 py-3 ${
                  index > 0 ? "border-t border-cream-300" : ""
                }`}
                testID={`finyk-custom-cat-row-${item.id}`}
              >
                <Text
                  className="text-sm font-medium text-fg flex-1 min-w-0"
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Видалити «${item.label}»`}
                  onPress={() => setPendingDeleteId(item.id)}
                  testID={`finyk-custom-cat-remove-${item.id}`}
                  className="shrink-0 px-2 py-1"
                >
                  <Text className="text-xs font-semibold text-red-500">
                    Видалити
                  </Text>
                </Pressable>
              </View>
            )}
          />
        ) : (
          <Text className="text-xs text-fg-muted">
            Поки немає власних категорій.
          </Text>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title="Monobank">
        <DeferredNotice>
          Підключення Monobank, статус підʼєднання та очистка кешу транзакцій
          підключаться з портом модуля Фінік (Phase 4+). На web вони живуть
          поверх OAuth-флоу, який на mobile ще не портований.
        </DeferredNotice>
      </SettingsSubGroup>

      <SettingsSubGroup title="Рахунки">
        <DeferredNotice>
          Приховування рахунків з балансу та нетворсу тягне `finyk_info_cache` з
          Monobank-флоу — підключиться разом із портом модуля Фінік.
        </DeferredNotice>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
