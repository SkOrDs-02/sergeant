/**
 * Sergeant Hub-core — GeneralSection (React Native)
 *
 * Mobile mirror of `apps/web/src/core/settings/GeneralSection.tsx`.
 *
 * Within-reach parity:
 *  - "Темна тема" toggle — persisted via MMKV under the shared
 *    `STORAGE_KEYS.HUB_PREFS` slice so the user's choice rides the
 *    same cloud-sync envelope as on web.
 *  - "Показувати AI-коуч" toggle — mirrors the web
 *    `useHubPref("showCoach", true)` semantics (default on;
 *    `prefs.showCoach !== false`).
 *  - **Local backup export / import** — uses the shared
 *    `downloadJson` + `pickJson` contracts backed by
 *    `expo-file-system` + `expo-sharing` + `expo-document-picker`.
 *
 * Dashboard reorder list:
 *  - Рендерить **видимий** підмножину модулей з ↑/↓ — a11y fallback
 *    for the long-press drag on the dashboard itself. State is shared
 *    with the dashboard via `useDashboardOrder` and persisted through
 *    the same `STORAGE_KEYS.DASHBOARD_ORDER` slice used by web.
 *
 * Deferred (tracked in `docs/mobile/react-native-migration.md` Phase 2 /
 * Hub-core, section 2.4):
 *  - **Cloud sync push / pull buttons.** Web passes `user` +
 *    `useCloudSync(user)` handlers from a screen wrapper.
 *    `CloudSyncProvider` already owns the scheduler on mobile, so
 *    a leaf component re-instantiating `useCloudSync` would
 *    double-mount NetInfo listeners and the periodic retry. A
 *    dedicated read/trigger hook lands in a follow-up; until then
 *    a `Card` notice explains the deferral inline.
 *
 * Dark-mode wiring:
 *  - Toggling "Темна тема" flips `prefs.darkMode` in the shared
 *    `STORAGE_KEYS.HUB_PREFS` MMKV slice.
 *  - `<ColorSchemeBridge />` (mounted in `apps/mobile/app/_layout.tsx`)
 *    subscribes to the same slice and calls
 *    `nativewind.colorScheme.set(...)`, which in turn re-tints every
 *    semantic-token surface (`bg-panel`, `text-fg`, `border-line`, …)
 *    via the `:root` ↔ `.dark` palette in `apps/mobile/global.css`.
 *  - Tri-state: `darkMode === true → "dark"`,
 *    `darkMode === false → "light"`, missing → `"system"` (follows OS).
 */

import { useState } from "react";
import { DeviceEventEmitter, Pressable, Text, View } from "react-native";
import { Sun, Moon, Smartphone } from "lucide-react-native";

import { useThemeMode, type ThemeMode } from "@/core/theme/ColorSchemeBridge";
import { colors } from "@/theme";
import {
  ALL_MODULES,
  DASHBOARD_MODULE_LABELS,
  DASHBOARD_DENSITIES,
  DASHBOARD_DENSITY_LABELS,
  DASHBOARD_DENSITY_DESCRIPTIONS,
  normalizeDashboardDensity,
  downloadJson,
  getActiveModules,
  getHideInactiveModules,
  pickJson,
  resetOnboardingState,
  setActiveModules,
  setHideInactiveModules,
  STORAGE_KEYS,
  type DashboardDensity,
  type DashboardModuleId,
} from "@sergeant/shared";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useDashboardOrder } from "@/core/dashboard/useDashboardOrder";
import {
  buildHubBackupPayload,
  applyHubBackupPayload,
} from "@/core/hub/hubBackup";
import { mobileKVStore, useLocalStorage } from "@/lib/storage";
import { OnboardingWizard } from "@/core/OnboardingWizard";

import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

interface HubPrefs {
  showCoach?: boolean;
  darkMode?: boolean;
  showHints?: boolean;
}

// Mirrors the web `hub_prefs_v1` key so cloud-synced prefs live in a
// single slice across platforms. See
// `apps/web/src/core/settings/hubPrefs.ts`.
const HUB_PREFS_KEY = STORAGE_KEYS.HUB_PREFS;

function DeferredNotice({ children }: { children: string }) {
  return (
    <Card variant="flat" radius="md" padding="md" className="border-dashed">
      <Text className="text-xs text-fg-muted leading-snug">{children}</Text>
    </Card>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Світла", Icon: Sun },
  { value: "dark", label: "Темна", Icon: Moon },
  { value: "system", label: "Системна", Icon: Smartphone },
];

function ThemeToggle() {
  const { mode, setTheme, isDark } = useThemeMode();

  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-fg">Тема оформлення</Text>
      <View className="flex-row gap-2">
        {THEME_OPTIONS.map(({ value, label, Icon }) => {
          const isSelected = mode === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Тема: ${label}`}
              accessibilityHint="Змінює тему оформлення застосунку"
              onPress={() => setTheme(value)}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border py-3 active:scale-[0.98] ${
                isSelected
                  ? "border-brand bg-brand/10"
                  : "border-cream-300 bg-cream-50 dark:border-cream-600 dark:bg-cream-800"
              }`}
              testID={`theme-toggle-${value}`}
            >
              <Icon
                size={18}
                color={
                  isSelected
                    ? colors.accent
                    : isDark
                      ? colors.textMuted
                      : colors.textMuted
                }
                strokeWidth={2}
              />
              <Text
                className={`text-sm font-medium ${
                  isSelected ? "text-brand" : "text-fg"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ModuleReorderList() {
  const { visibleOrder, reorderVisible } = useDashboardOrder();

  if (visibleOrder.length === 0) {
    return (
      <DeferredNotice>
        Поки що жоден модуль не відображається на дашборді.
      </DeferredNotice>
    );
  }

  return (
    <View className="overflow-hidden rounded-xl border border-cream-300">
      {visibleOrder.map((id, index) => {
        const isFirst = index === 0;
        const isLast = index === visibleOrder.length - 1;
        const label = DASHBOARD_MODULE_LABELS[id];
        return (
          <View
            key={id}
            className={`flex-row items-center gap-2 bg-cream-50 px-3 py-2 ${
              isFirst ? "" : "border-t border-cream-300"
            }`}
          >
            <Text className="w-4 text-xs font-semibold text-fg-muted tabular-nums">
              {index + 1}
            </Text>
            <Text className="flex-1 text-sm text-fg" numberOfLines={1}>
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Підняти ${label} вище`}
              accessibilityState={{ disabled: isFirst }}
              disabled={isFirst}
              onPress={() => reorderVisible(index, index - 1)}
              className={`h-8 w-8 items-center justify-center rounded-lg ${
                isFirst ? "opacity-30" : "active:bg-cream-200"
              }`}
              testID={`dashboard-reorder-up-${id}`}
            >
              <Text className="text-sm text-fg-muted">▲</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Опустити ${label} нижче`}
              accessibilityState={{ disabled: isLast }}
              disabled={isLast}
              onPress={() => reorderVisible(index, index + 1)}
              className={`h-8 w-8 items-center justify-center rounded-lg ${
                isLast ? "opacity-30" : "active:bg-cream-200"
              }`}
              testID={`dashboard-reorder-down-${id}`}
            >
              <Text className="text-sm text-fg-muted">▼</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

export function GeneralSection() {
  const [prefs, setPrefs] = useLocalStorage<HubPrefs>(HUB_PREFS_KEY, {});
  const [confirmImport, setConfirmImport] = useState(false);
  // Tour replay (S4.5 mobile parity): show the welcome wizard in
  // read-only mode so users can re-watch the FTUX without resetting
  // their state. Distinct from "Перезапустити онбординг", which wipes
  // vibe picks + first-action flags via `resetOnboardingState`. Mirror
  // of `apps/web/src/core/settings/GeneralSection.tsx`.
  const [tourOpen, setTourOpen] = useState(false);
  const toast = useToast();

  const showCoach = prefs.showCoach !== false;
  const showHints = prefs.showHints !== false;
  const [density, setDensityState] = useLocalStorage<string>(
    STORAGE_KEYS.DASHBOARD_DENSITY,
    "comfortable",
  );
  const currentDensity = normalizeDashboardDensity(density) as DashboardDensity;
  const handleDensityChange = (d: DashboardDensity) => setDensityState(d);

  const [activeModules, setActiveModulesState] = useState<DashboardModuleId[]>(
    () => getActiveModules(mobileKVStore),
  );
  const [hideInactive, setHideInactiveState] = useState(() =>
    getHideInactiveModules(mobileKVStore),
  );
  const toggleActive = (id: DashboardModuleId) => {
    setActiveModulesState((prev) => {
      const isActive = prev.includes(id);
      if (isActive && prev.length === 1) {
        toast.error("Щонайменше один модуль має бути активним");
        return prev;
      }
      const next = isActive
        ? prev.filter((x) => x !== id)
        : ALL_MODULES.filter((x) => prev.includes(x) || x === id);
      setActiveModules(mobileKVStore, next);
      return next;
    });
  };
  const toggleHideInactive = (next: boolean) => {
    setHideInactiveState(next);
    setHideInactiveModules(mobileKVStore, next);
  };

  const handleExport = async () => {
    try {
      const payload = buildHubBackupPayload();
      await downloadJson(
        `hub-backup-${new Date().toISOString().slice(0, 10)}.json`,
        payload,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не вдалось експортувати",
      );
    }
  };

  const handleImportConfirmed = async () => {
    setConfirmImport(false);
    try {
      const result = await pickJson();
      if (!result) return;
      applyHubBackupPayload(result.data);
      toast.success("Резервну копію відновлено");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Не вдалось імпортувати файл",
      );
    }
  };

  return (
    <SettingsGroup title="Загальні" emoji="⚙️" testID="settings-general-group">
      <ThemeToggle />
      <SettingsSubGroup title="Дашборд">
        <ToggleRow
          label="Показувати AI-коуч"
          description="Блок з щоденною порадою коуча на головному екрані."
          checked={showCoach}
          onChange={(next) =>
            setPrefs((prev) => ({ ...prev, showCoach: next }))
          }
          testID="general-show-coach-toggle"
        />
        <ToggleRow
          label="Показувати підказки"
          description="Короткі підказки в моменті (без спаму)."
          checked={showHints}
          onChange={(next) =>
            setPrefs((prev) => ({ ...prev, showHints: next }))
          }
          testID="general-show-hints-toggle"
        />
      </SettingsSubGroup>
      <SettingsSubGroup title="Щільність дашборду">
        <Text className="text-xs text-fg-muted leading-snug">
          Скільки простору між картками на головному екрані.
        </Text>
        <View className="flex-row gap-2">
          {DASHBOARD_DENSITIES.map((d) => (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityState={{ selected: d === currentDensity }}
              accessibilityLabel={DASHBOARD_DENSITY_LABELS[d]}
              onPress={() => handleDensityChange(d)}
              className={`flex-1 rounded-xl border px-3 py-2.5 ${
                d === currentDensity
                  ? "border-brand bg-brand/8"
                  : "border-cream-300 bg-cream-50 active:bg-cream-100"
              }`}
              testID={`dashboard-density-${d}`}
            >
              <Text
                className={`text-sm font-medium ${
                  d === currentDensity ? "text-brand" : "text-fg"
                }`}
              >
                {DASHBOARD_DENSITY_LABELS[d]}
              </Text>
              <Text
                className="text-[11px] text-fg-muted mt-0.5"
                numberOfLines={2}
              >
                {DASHBOARD_DENSITY_DESCRIPTIONS[d]}
              </Text>
            </Pressable>
          ))}
        </View>
      </SettingsSubGroup>
      <SettingsSubGroup title="Онбординг">
        <Text className="text-xs text-fg-muted leading-snug">
          Подивитись tour — побачити вітальний екран ще раз без скидання твого
          стану. Перезапуск не видаляє твої дані — лише повертає вітальний екран
          та підказки першого запуску.
        </Text>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => setTourOpen(true)}
          testID="general-replay-tour"
        >
          Подивитись tour
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            resetOnboardingState(mobileKVStore);
            DeviceEventEmitter.emit("hub:onboardingReset");
          }}
          testID="general-restart-onboarding"
        >
          Перезапустити онбординг
        </Button>
      </SettingsSubGroup>
      <SettingsSubGroup title="Активні модулі">
        <Text className="text-xs text-fg-muted leading-snug">
          Неактивні модулі відображаються на дашборді приглушено — без кнопки
          швидкого додавання. Чонайменше один модуль має залишатися активним.
        </Text>
        <View className="overflow-hidden rounded-xl border border-cream-300">
          {ALL_MODULES.map((id, index) => {
            const checked = activeModules.includes(id);
            const label = DASHBOARD_MODULE_LABELS[id];
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                accessibilityLabel={label}
                onPress={() => toggleActive(id)}
                className={`flex-row items-center gap-3 bg-cream-50 px-3 py-3 active:bg-cream-100 ${
                  index === 0 ? "" : "border-t border-cream-300"
                }`}
                testID={`general-active-module-${id}`}
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    checked
                      ? "border-primary bg-primary"
                      : "border-cream-300 bg-cream-50"
                  }`}
                >
                  {checked ? (
                    <Text className="text-[11px] font-bold text-bg">✓</Text>
                  ) : null}
                </View>
                <Text className="flex-1 text-sm text-fg">{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ToggleRow
          label="Приховати неактивні модулі"
          description="Повністю ховає неактивні плитки з дашборду."
          checked={hideInactive}
          onChange={toggleHideInactive}
          testID="general-hide-inactive-toggle"
        />
      </SettingsSubGroup>
      <SettingsSubGroup title="Упорядкувати модулі">
        <ModuleReorderList />
      </SettingsSubGroup>
      <SettingsSubGroup title="Хмарна синхронізація">
        <DeferredNotice>
          Кнопки ручного збереження та завантаження з хмари підключаються у
          наступному PR — разом із read-only хуком, який не дублюватиме вже
          активний CloudSyncProvider.
        </DeferredNotice>
      </SettingsSubGroup>
      <SettingsSubGroup title="Резервна копія Hub">
        <Card variant="flat" radius="md" padding="md">
          <Text className="text-xs text-fg-muted leading-relaxed mb-3">
            Резервна копія всього Hub (Фінік, Фізрук, Рутина, Харчування). Токен
            Monobank і кеш транзакцій не входять у файл.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onPress={handleExport}
              testID="general-export-backup"
            >
              Експортувати
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setConfirmImport(true)}
              testID="general-import-backup"
            >
              Імпортувати…
            </Button>
          </View>
        </Card>
        <ConfirmDialog
          open={confirmImport}
          title="Імпорт резервної копії"
          description="Поточні дані модулів будуть замінені даними з файлу. Продовжити?"
          confirmLabel="Імпортувати"
          cancelLabel="Скасувати"
          danger={false}
          onConfirm={handleImportConfirmed}
          onCancel={() => setConfirmImport(false)}
        />
      </SettingsSubGroup>
      <View className="gap-1">
        <Text className="text-[11px] text-fg-subtle leading-snug">
          Решта опцій цього блоку (push/pull хмари) портується разом із
          відповідними інфраструктурними кроками — див. примітки вище.
        </Text>
      </View>
      {tourOpen ? (
        <OnboardingWizard mode="tour" onDone={() => setTourOpen(false)} />
      ) : null}
    </SettingsGroup>
  );
}
