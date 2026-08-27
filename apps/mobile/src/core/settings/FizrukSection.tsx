/**
 * Sergeant Hub-core — FizrukSection (React Native, first cut)
 *
 * Mobile mirror of `apps/web/src/core/settings/FizrukSection.tsx`.
 *
 * Within-reach parity (does the real thing now):
 *  - "Таймер відпочинку" — 30/60/90/120/180s pills per rest category
 *    (`compound` / `isolation` / `cardio`). `REST_CATEGORY_LABELS` та
 *    `REST_DEFAULTS` беремо з `@sergeant/fizruk-domain` — той самий
 *    DOM-free пакет, з якого читає web-хук `useRestSettings`. Вибір
 *    користувача персистимо через MMKV-бекований `useLocalStorage`
 *    у `STORAGE_KEYS.FIZRUK_REST_SETTINGS` (той самий ключ
 *    `fizruk_rest_settings_v1` використовує web — payload рідe під
 *    тим самим cloud-sync-конвертом, нічого мігрувати не треба).
 *
 * Deferred (див. `docs/mobile/react-native-migration.md` Phase 2 / Hub-core,
 * §2.4) — рендериться як `DeferredNotice`-карточка:
 *  - **Резервні копії та дані** (`WorkoutBackupBar` на web).
 *    Експорт / імпорт тренувань чекають реальний mobile-адаптер
 *    `downloadJson` (expo-file-system + expo-sharing) та
 *    `expo-document-picker` для імпорту — сьогодні у коді є лише
 *    warn-only stub у `apps/mobile/src/lib/fileDownload.ts`. Підключиться
 *    з портом модуля Фізрук (Phase 6) разом із рештою backup-flows.
 */

import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  REST_CATEGORY_LABELS,
  REST_DEFAULTS,
  type RestCategory,
} from "@sergeant/fizruk-domain/lib/restSettings";

import { Card } from "@/components/ui/Card";
import { useLocalStorage } from "@/lib/storage";

import { SettingsGroup, SettingsSubGroup } from "./SettingsPrimitives";

const REST_KEY = STORAGE_KEYS.FIZRUK_REST_SETTINGS;

// Mirrors the web pill set 1:1 (30/60/90/120/180 seconds).
const REST_PRESETS: readonly number[] = [30, 60, 90, 120, 180] as const;

type RestSettings = Partial<Record<RestCategory, number>>;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function DeferredNotice({ children }: { children: string }) {
  return (
    <Card variant="flat" radius="md" padding="md" className="border-dashed">
      <Text className="text-xs text-fg-muted leading-snug">{children}</Text>
    </Card>
  );
}

export function FizrukSection() {
  const [settings, setSettings] = useLocalStorage<RestSettings>(REST_KEY, {});

  const resolved = useMemo<Record<RestCategory, number>>(() => {
    return { ...REST_DEFAULTS, ...settings };
  }, [settings]);

  const categories = useMemo(
    () =>
      (Object.entries(REST_CATEGORY_LABELS) as [RestCategory, string][]).map(
        ([cat, label]) => ({ cat, label }),
      ),
    [],
  );

  return (
    <SettingsGroup title="Фізрук" emoji="🏋️">
      <SettingsSubGroup title="Таймер відпочинку">
        <Text className="text-xs text-fg-muted leading-snug">
          Рекомендований час відпочинку підбирається автоматично за типом
          вправи. Ці значення зʼявляться як кнопка за замовчуванням у кожній
          вправі.
        </Text>
        <View className="gap-3">
          {categories.map(({ cat, label }) => (
            <View
              key={cat}
              className="flex-row items-center gap-3"
              testID={`fizruk-rest-row-${cat}`}
            >
              <Text className="text-xs text-fg flex-1 min-w-0">{label}</Text>
              <View className="flex-row items-center gap-1 flex-wrap justify-end">
                {REST_PRESETS.map((sec) => {
                  const selected = resolved[cat] === sec;
                  return (
                    <Pressable
                      key={sec}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={`${label}: ${sec} секунд`}
                      testID={`fizruk-rest-${cat}-${sec}`}
                      onPress={() =>
                        setSettings((prev) => ({ ...prev, [cat]: sec }))
                      }
                      className={cx(
                        "h-9 w-14 rounded-xl border items-center justify-center",
                        selected
                          ? "border-brand-500 bg-brand-50"
                          : "border-cream-300 bg-cream-50",
                      )}
                    >
                      <Text
                        className={cx(
                          "text-xs font-semibold",
                          selected ? "text-brand-700" : "text-fg-muted",
                        )}
                      >
                        {sec}с
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </SettingsSubGroup>

      <SettingsSubGroup title="Резервні копії та дані">
        <DeferredNotice>
          Експорт та імпорт тренувань чекають реального mobile-адаптера
          downloadJson (expo-file-system + expo-sharing) та
          expo-document-picker, сьогодні у коді є лише warn-only заглушка.
          Підключиться з портом модуля Фізрук (Phase 6).
        </DeferredNotice>
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
