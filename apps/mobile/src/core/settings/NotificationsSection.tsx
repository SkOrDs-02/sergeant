/**
 * Sergeant Hub-core — NotificationsSection (React Native)
 *
 * Mobile port of `apps/web/src/core/settings/NotificationsSection.tsx`.
 *
 * Within-reach parity (does the real thing now):
 *  - Native push-permission status card (first UI element on the
 *    section). Reads `Notifications.getPermissionsAsync()` on mount
 *    and wires a `Дозволити сповіщення` button to
 *    `Notifications.requestPermissionsAsync()`. `denied` surfaces a
 *    secondary `Відкрити налаштування` button that calls
 *    `Linking.openSettings()` — mirrors the web "open browser
 *    settings" hint but actionable on mobile (iOS/Android bury the
 *    system-notifications toggle deep enough that a one-tap shortcut
 *    is the whole UX).
 *  - Routine-reminders toggle — persists `routineRemindersEnabled` into
 *    the canonical `useRoutinePrefs` hook (SQLite `routine_prefs` table,
 *    written via `saveRoutineState` / dual-write pipeline). The legacy
 *    `@routine_prefs_v1` MMKV orphan path is retired; the preference is
 *    merged with the calendar-visibility flags already stored by
 *    `RoutineSection` in the same prefs record.
 *  - Fizruk monthly-plan reminder — toggle + hour/minute via
 *    `useMonthlyPlan` (SQLite warm cache + fizruk dual-write), analogue
 *    to the web Фізрук sub-group.
 *  - Nutrition reminder — toggle + hour via `useNutritionPrefs`.
 *
 * Notes on the permission-status model:
 *  - `expo-notifications` returns a `PermissionStatus` of
 *    `"granted" | "denied" | "undetermined"`. Web's fourth state
 *    (`"unsupported"` — no global `Notification` constructor) has no
 *    native equivalent: `expo-notifications` is always available on
 *    iOS/Android. The labels therefore collapse down to three.
 *  - iOS `provisional` authorisation is treated as `granted`
 *    (matches `registerPush.ensurePermissions` in
 *    `apps/mobile/src/features/push/registerPush.ts`).
 */

import { useCallback, useEffect, useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import * as Notifications from "expo-notifications";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useMonthlyPlan } from "@/modules/fizruk/hooks/useMonthlyPlan";
import { useNutritionPrefs } from "@/modules/nutrition/hooks/useNutritionPrefs";
import { useRoutinePrefs } from "@/modules/routine/hooks/useRoutinePrefs";

import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

type PermStatus = "granted" | "denied" | "undetermined";

const PERM_LABELS: Record<PermStatus, string> = {
  granted: "Дозволено",
  denied: "Заблоковано",
  undetermined: "Не встановлено",
};

const PERM_TEXT_CLASS: Record<PermStatus, string> = {
  granted: "text-emerald-600",
  denied: "text-rose-600",
  undetermined: "text-amber-600",
};

function isGranted(perm: Notifications.NotificationPermissionsStatus): boolean {
  if (perm.granted) return true;
  return perm.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function toStatus(
  perm: Notifications.NotificationPermissionsStatus,
): PermStatus {
  if (isGranted(perm)) return "granted";
  if (perm.status === "denied") return "denied";
  return "undetermined";
}

function clampReminderHour(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(23, Math.max(0, Math.trunc(value)));
}

function clampReminderMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(59, Math.max(0, Math.trunc(value)));
}

export function NotificationsSection() {
  const [permStatus, setPermStatus] = useState<PermStatus>("undetermined");
  const { prefs: routinePrefs, updatePrefs: updateRoutinePrefs } =
    useRoutinePrefs();
  const {
    reminderEnabled: fizrukReminderEnabled,
    reminderHour: fizrukReminderHour,
    reminderMinute: fizrukReminderMinute,
    setReminder: setFizrukReminder,
    setReminderEnabled: setFizrukReminderEnabled,
  } = useMonthlyPlan();
  const { prefs: nutritionPrefs, updatePrefs: updateNutritionPrefs } =
    useNutritionPrefs();

  const applyPermStatus = useCallback((next: PermStatus) => {
    void Promise.resolve().then(() => setPermStatus(next));
  }, []);

  const refreshPermissions = useCallback(async () => {
    try {
      const perm = await Notifications.getPermissionsAsync();
      applyPermStatus(toStatus(perm));
    } catch {
      // Native modules can throw on some simulators / dev builds
      // without the notifications entitlement — treat as undetermined
      // rather than crashing the settings screen.
      applyPermStatus("undetermined");
    }
  }, [applyPermStatus]);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const requestPermissionStatus = useCallback(async (): Promise<PermStatus> => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      const nextStatus = toStatus(perm);
      applyPermStatus(nextStatus);
      return nextStatus;
    } catch {
      applyPermStatus("denied");
      return "denied";
    }
  }, [applyPermStatus]);

  const requestPermission = useCallback(() => {
    void requestPermissionStatus();
  }, [requestPermissionStatus]);

  const openSystemSettings = useCallback(() => {
    // `Linking.openSettings()` is the RN-standard way to jump to the
    // app's entry in the OS settings. On iOS it lands on the app
    // permission sheet (notifications toggle visible); on Android on
    // the app details page (user taps "Notifications" from there).
    void Linking.openSettings();
  }, []);

  const handleFizrukToggle = useCallback(
    async (next: boolean) => {
      if (next && permStatus !== "granted") {
        const nextStatus = await requestPermissionStatus();
        if (nextStatus !== "granted") return;
      }
      setFizrukReminderEnabled(next);
    },
    [permStatus, requestPermissionStatus, setFizrukReminderEnabled],
  );

  const handleFizrukHourChange = useCallback(
    (value: string) => {
      setFizrukReminder(clampReminderHour(Number(value)), fizrukReminderMinute);
    },
    [fizrukReminderMinute, setFizrukReminder],
  );

  const handleFizrukMinuteChange = useCallback(
    (value: string) => {
      setFizrukReminder(fizrukReminderHour, clampReminderMinute(Number(value)));
    },
    [fizrukReminderHour, setFizrukReminder],
  );

  const handleNutritionToggle = useCallback(
    async (next: boolean) => {
      if (next && permStatus !== "granted") {
        const nextStatus = await requestPermissionStatus();
        if (nextStatus !== "granted") return;
      }
      updateNutritionPrefs({ reminderEnabled: next });
    },
    [permStatus, requestPermissionStatus, updateNutritionPrefs],
  );

  const handleNutritionHourChange = useCallback(
    (value: string) => {
      updateNutritionPrefs({ reminderHour: clampReminderHour(Number(value)) });
    },
    [updateNutritionPrefs],
  );

  const routineEnabled = routinePrefs.routineRemindersEnabled === true;
  const nutritionReminderEnabled = nutritionPrefs.reminderEnabled === true;
  const nutritionReminderHour = nutritionPrefs.reminderHour ?? 12;

  return (
    <SettingsGroup title="Сповіщення" emoji="🔔">
      <Card variant="flat" radius="md" padding="md">
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1 min-w-0">
            <Text className="text-sm font-semibold text-fg">
              Push-сповіщення
            </Text>
            <Text
              className={`text-xs mt-0.5 font-medium ${PERM_TEXT_CLASS[permStatus]}`}
              testID="notifications-permission-status"
            >
              {PERM_LABELS[permStatus]}
            </Text>
          </View>
          {permStatus === "undetermined" ? (
            <Button
              size="sm"
              onPress={requestPermission}
              testID="notifications-request-permission"
            >
              Дозволити
            </Button>
          ) : null}
          {permStatus === "denied" ? (
            <Button
              size="sm"
              variant="secondary"
              onPress={openSystemSettings}
              testID="notifications-open-settings"
            >
              Налаштування
            </Button>
          ) : null}
        </View>
        {permStatus === "denied" ? (
          <Text className="text-xs text-fg-muted mt-2 leading-snug">
            Сповіщення заблоковано у системних налаштуваннях. Увімкни їх там,
            щоб отримувати нагадування.
          </Text>
        ) : null}
      </Card>

      <SettingsSubGroup title="Рутина (звички)">
        <ToggleRow
          label="Нагадування про звички"
          description="Спрацьовує у встановлений в кожній звичці час. Повноцінне планування нагадувань підключиться з портом модуля Рутина (Phase 5) — зараз значення зберігається і буде підхоплено автоматично."
          checked={routineEnabled}
          onChange={(next) =>
            updateRoutinePrefs({ routineRemindersEnabled: next })
          }
          testID="notifications-routine-toggle"
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Фізрук (тренування)">
        <ToggleRow
          label="Нагадування про тренування"
          description="Надсилається о вказаній годині, якщо на сьогодні призначено тренування. Якщо push-дозвіл ще не виданий, спершу попросимо його."
          checked={fizrukReminderEnabled}
          onChange={(next) => {
            void handleFizrukToggle(next);
          }}
          testID="notifications-fizruk-toggle"
        />
        {fizrukReminderEnabled ? (
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 min-w-0">
              <Text className="text-sm text-fg">Час нагадування</Text>
              <Text className="text-xs text-fg-muted mt-0.5 leading-snug">
                Година 0–23 і хвилина 0–59, як у web settings Фізрук.
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={String(fizrukReminderHour)}
                onChangeText={handleFizrukHourChange}
                keyboardType="number-pad"
                inputMode="numeric"
                selectTextOnFocus
                maxLength={2}
                className="w-14 h-10 rounded-xl border border-cream-300 dark:border-cream-700 bg-cream-50 dark:bg-cream-800 px-2 text-center text-sm text-fg"
                testID="notifications-fizruk-hour"
              />
              <Text className="text-xs text-fg-muted">:</Text>
              <TextInput
                value={String(fizrukReminderMinute).padStart(2, "0")}
                onChangeText={handleFizrukMinuteChange}
                keyboardType="number-pad"
                inputMode="numeric"
                selectTextOnFocus
                maxLength={2}
                className="w-14 h-10 rounded-xl border border-cream-300 dark:border-cream-700 bg-cream-50 dark:bg-cream-800 px-2 text-center text-sm text-fg"
                testID="notifications-fizruk-minute"
              />
            </View>
          </View>
        ) : null}
      </SettingsSubGroup>

      <SettingsSubGroup title="Харчування">
        <ToggleRow
          label="Нагадування про їжу"
          description="Зберігає щоденне нагадування у nutrition prefs: toggle + година, як у web settings. Якщо push-дозвіл ще не виданий, спершу попросимо його."
          checked={nutritionReminderEnabled}
          onChange={(next) => {
            void handleNutritionToggle(next);
          }}
          testID="notifications-nutrition-toggle"
        />
        {nutritionReminderEnabled ? (
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 min-w-0">
              <Text className="text-sm text-fg">Година нагадування</Text>
              <Text className="text-xs text-fg-muted mt-0.5 leading-snug">
                Від 0 до 23, синхронізується разом із налаштуваннями харчування.
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={String(nutritionReminderHour)}
                onChangeText={handleNutritionHourChange}
                keyboardType="number-pad"
                inputMode="numeric"
                selectTextOnFocus
                maxLength={2}
                className="w-16 h-10 rounded-xl border border-cream-300 dark:border-cream-700 bg-cream-50 dark:bg-cream-800 px-3 text-center text-sm text-fg"
                testID="notifications-nutrition-hour"
              />
              <Text className="text-xs text-fg-muted">год.</Text>
            </View>
          </View>
        ) : null}
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
