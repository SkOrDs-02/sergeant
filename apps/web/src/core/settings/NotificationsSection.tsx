import { useEffect, useState } from "react";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { requestRoutineNotificationPermission } from "../../modules/routine/hooks/useRoutineReminders";
import { useRoutineState } from "../../modules/routine/hooks/useRoutineState";
import { useMonthlyPlan } from "../../modules/fizruk/hooks/useMonthlyPlan";
import {
  loadNutritionPrefs,
  persistNutritionPrefs,
  NUTRITION_PREFS_KEY,
  type NutritionPrefs,
} from "../../modules/nutrition/lib/nutritionStorage";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";

type PermStatus = NotificationPermission | "unsupported";

export function NotificationsSection() {
  const [permStatus, setPermStatus] = useState<PermStatus>(() =>
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );
  const { warning: toastWarning } = useToast();

  const { routine, updatePref: updateRoutinePref } = useRoutineState();

  const monthlyPlan = useMonthlyPlan();

  const [nutritionPrefs, setNutritionPrefs] = useState<NutritionPrefs>(() =>
    loadNutritionPrefs(),
  );
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === NUTRITION_PREFS_KEY || e.key === null) {
        setNutritionPrefs(loadNutritionPrefs());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const r = await Notification.requestPermission();
      setPermStatus(r);
      if (r !== "granted") {
        toastWarning(
          "Дозволь сповіщення в налаштуваннях браузера, щоб отримувати нагадування.",
        );
      }
    } catch {
      setPermStatus("denied");
    }
  };

  const handleRoutineToggle = async (checked: boolean) => {
    if (checked) {
      const perm = await requestRoutineNotificationPermission();
      setPermStatus(perm);
      if (perm !== "granted") {
        toastWarning(
          "Без дозволу на сповіщення нагадування не надсилатимуться. Дозволь сповіщення у налаштуваннях браузера.",
        );
        return;
      }
    }
    updateRoutinePref("routineRemindersEnabled", checked);
  };

  const handleFizrukToggle = async (checked: boolean) => {
    if (checked && permStatus !== "granted") {
      const perm = await requestRoutineNotificationPermission();
      setPermStatus(perm);
      if (perm !== "granted") {
        toastWarning(
          "Без дозволу на сповіщення нагадування не надсилатимуться.",
        );
        return;
      }
    }
    monthlyPlan.setReminderEnabled(checked);
  };

  const handleNutritionToggle = async (checked: boolean) => {
    if (checked && permStatus !== "granted") {
      const perm = await requestRoutineNotificationPermission();
      setPermStatus(perm);
      if (perm !== "granted") {
        toastWarning(
          "Без дозволу на сповіщення нагадування не надсилатимуться.",
        );
        return;
      }
    }
    const next: NutritionPrefs = {
      ...nutritionPrefs,
      reminderEnabled: checked,
    };
    persistNutritionPrefs(next, NUTRITION_PREFS_KEY);
    setNutritionPrefs(next);
  };

  const permLabels: Record<PermStatus, string> = {
    granted: "Дозволено",
    denied: "Заблоковано",
    default: "Не встановлено",
    unsupported: "Не підтримується",
  };
  const permColors: Record<PermStatus, string> = {
    granted: "text-success",
    denied: "text-danger",
    default: "text-warning",
    unsupported: "text-muted",
  };
  const permLabel = permLabels[permStatus] ?? "Невідомо";
  const permColor = permColors[permStatus] ?? "text-muted";

  return (
    <SettingsGroup title="Сповіщення" emoji="🔔">
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg border border-line">
        <div>
          <p className="text-sm font-semibold text-text">Push-сповіщення</p>
          <p className={cn("text-xs mt-0.5 font-medium", permColor)}>
            {permLabel}
          </p>
        </div>
        {permStatus !== "granted" && permStatus !== "unsupported" && (
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0"
            onClick={requestPermission}
          >
            Дозволити
          </Button>
        )}
        {permStatus === "denied" && (
          <p className="text-xs text-subtle">
            Відкрий налаштування браузера, щоб дозволити
          </p>
        )}
      </div>

      <PushNotificationToggle className="p-3 rounded-xl bg-bg border border-line" />

      <SettingsSubGroup title="Звички (Рутина)" defaultOpen>
        <ToggleRow
          label="Нагадування про звички"
          description="Спрацьовує у встановлений в кожній звичці час, навіть коли застосунок закрито."
          checked={routine.prefs?.routineRemindersEnabled === true}
          onChange={handleRoutineToggle}
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Тренування (Фізрук)" defaultOpen>
        <ToggleRow
          label="Нагадування про тренування"
          description="Надсилається о вказаній годині, якщо на сьогодні призначено тренування."
          checked={monthlyPlan.reminderEnabled}
          onChange={handleFizrukToggle}
        />
        {monthlyPlan.reminderEnabled && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-subtle">Час</span>
            <input
              type="time"
              className="bg-bg border border-line rounded-xl px-3 py-2 text-sm text-text"
              value={`${String(monthlyPlan.reminderHour).padStart(2, "0")}:${String(monthlyPlan.reminderMinute).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                monthlyPlan.setReminder(h || 0, m || 0);
              }}
            />
          </label>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title="Харчування" defaultOpen>
        <ToggleRow
          label="Нагадування про їжу"
          description="Щоденне нагадування записати прийоми їжі, навіть коли застосунок закрито."
          checked={Boolean(nutritionPrefs.reminderEnabled)}
          onChange={handleNutritionToggle}
        />
        {nutritionPrefs.reminderEnabled && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-subtle">Година</span>
            <input
              type="number"
              min={0}
              max={23}
              className="w-16 h-9 rounded-xl bg-panel border border-line px-2 text-sm text-text"
              value={nutritionPrefs.reminderHour ?? 12}
              onChange={(e) => {
                const next: NutritionPrefs = {
                  ...nutritionPrefs,
                  reminderHour: Math.min(
                    23,
                    Math.max(0, Number(e.target.value) || 0),
                  ),
                };
                persistNutritionPrefs(next, NUTRITION_PREFS_KEY);
                setNutritionPrefs(next);
              }}
            />
            <span className="text-xs text-subtle">год.</span>
          </label>
        )}
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
