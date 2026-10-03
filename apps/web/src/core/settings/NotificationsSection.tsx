import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Segmented } from "@shared/components/ui/Segmented";
import { TimeField } from "@shared/components/ui/TimeField";
import { useToast } from "@shared/hooks/useToast";
import { requestNotificationPermission } from "@shared/hooks/useModuleReminder";
import { usePushNotifications } from "@shared/hooks/usePushNotifications";
import { settingsSectionTitle } from "../hub/settingsSectionsCatalog";
import { useRoutineState } from "../../modules/routine/hooks/useRoutineState";
import { useMonthlyPlan } from "../../modules/fizruk/hooks/useMonthlyPlan";
import {
  loadNutritionPrefs,
  persistNutritionPrefs,
  NUTRITION_PREFS_KEY,
  type NutritionPrefs,
} from "../../modules/nutrition/lib/nutritionStorage";
import { messages } from "@shared/i18n/uk";
import { PUSH_DAILY_CAP_DEFAULT, PUSH_DAILY_CAP_MAX } from "@sergeant/shared";
import { PushNotificationToggle } from "../components/PushNotificationToggle";
import {
  SettingsGroup,
  SettingsSubGroup,
  ToggleRow,
} from "./SettingsPrimitives";
import { useServerPreference } from "./useServerPreference";

const sergeantCopy = messages.sergeant;

const CAP_OPTIONS = Array.from({ length: PUSH_DAILY_CAP_MAX + 1 }, (_, n) => ({
  value: String(n),
  label: String(n),
}));

type PermStatus = NotificationPermission | "unsupported";

export function NotificationsSection() {
  const [permStatus, setPermStatus] = useState<PermStatus>(() =>
    typeof Notification !== "undefined"
      ? Notification.permission
      : "unsupported",
  );
  const { warning: toastWarning } = useToast();

  // Три перемикачі нижче обіцяли «навіть коли застосунок закрито» —
  // і це була неправда: нагадування вів локальний таймер, який помирав
  // разом із вкладкою. Тепер їх шле сервер, але лише тим, у кого є жива
  // push-підписка. Тож обіцянку віддаємо умовно, за фактичним станом:
  // мовчазний перемикач, що нічого не робить, — гірший за чесний рядок.
  const { subscribed: pushSubscribed } = usePushNotifications();
  const backgroundHint = (base: string): string =>
    pushSubscribed
      ? `${base} Приходить навіть коли застосунок закрито.`
      : `${base} Щоб приходило при закритому застосунку, увімкни push-сповіщення вище.`;

  const { routine, updatePref: updateRoutinePref } = useRoutineState();

  // Живе на сервері, а не в localStorage: цей прапорець читає серверний
  // шедулер тоді, коли жодного клієнта не запущено.
  const sergeantNudges = useServerPreference(
    "sergeantNudges",
    {
      saveError: sergeantCopy.nudgesSaveError,
      authRequired: sergeantCopy.nudgesAuthRequired,
    },
    false,
  );

  // Стеля спільна для всіх модулів і Сержанта: сервер згортає приводи
  // понад неї в одне сповіщення (`apps/server/src/lib/reminders/budget.ts`).
  const pushDailyCap = useServerPreference(
    "pushDailyCap",
    {
      saveError: sergeantCopy.nudgesSaveError,
      authRequired: sergeantCopy.nudgesAuthRequired,
    },
    PUSH_DAILY_CAP_DEFAULT,
  );

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
      const perm = await requestNotificationPermission();
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
      const perm = await requestNotificationPermission();
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
      const perm = await requestNotificationPermission();
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
    granted: "text-success-strong dark:text-success",
    denied: "text-danger-strong dark:text-danger",
    default: "text-warning-strong dark:text-warning",
    unsupported: "text-muted",
  };
  const permLabel = permLabels[permStatus] ?? "Невідомо";
  const permColor = permColors[permStatus] ?? "text-muted";

  return (
    // V-7 (2026-08-08): title читається з каталогу, а не хардкодиться тут —
    // раніше цей рядок і ⌘K-індекс (settingsSectionsCatalog.ts) розходились
    // ("Сповіщення" тут vs "Нагадування" у пошуку) без жодної перевірки.
    <SettingsGroup title={settingsSectionTitle("notifications")} icon="bell">
      {/* Два рядки поспіль мали один підпис «Push-сповіщення» (браузерний
          дозвіл і власне підписка) і читались як дубль (огляд 2026-09-04).
          Перший рядок — про дозвіл браузера, і називається так. */}
      <div className="flex items-center justify-between gap-3 py-2 border-b border-line/60">
        <div>
          <p className="text-style-label text-text">Дозвіл браузера</p>
          <p className={cn("text-style-caption mt-0.5", permColor)}>
            {permLabel}
          </p>
        </div>
        {/* `denied` — це кінцевий стан: `Notification.requestPermission()`
            резолвиться миттєво тим самим `denied`, не показуючи промпт.
            Кнопка тут була б обіцянкою, яку браузер не виконає, тож на
            цьому шляху лишається лише інструкція. */}
        {permStatus === "default" && (
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
          // AI-NOTE: caption навмисно — це підказка в рядку контролу, поруч із
          // статусом «Заблоковано», а не абзац, який читають окремо.
          <p className="text-style-caption text-subtle max-w-[14rem] text-right">
            Відкрий налаштування сайту в браузері (значок біля адреси) і дозволь
            сповіщення
          </p>
        )}
      </div>

      <PushNotificationToggle className="py-2 border-b border-line/60" />

      <SettingsSubGroup title="Скільки на день">
        <div className="py-2">
          <p className="text-style-label text-text">
            Нагадувань на день, не більше
          </p>
          <p className="text-style-caption text-muted mt-0.5">
            {pushDailyCap.value === 0
              ? "Нагадування вимкнені: ні звички, ні тренування, ні Сержант не надсилатимуть сповіщень."
              : "Якщо приводів більше, обʼєдную їх в одне сповіщення. Жоден не загубиться."}
          </p>
          <Segmented
            className="mt-2"
            size="md"
            items={CAP_OPTIONS}
            value={String(pushDailyCap.value)}
            onChange={(next) => void pushDailyCap.set(Number(next))}
            ariaLabel="Нагадувань на день, не більше"
          />
        </div>
        {pushDailyCap.error && (
          <p
            className={
              pushDailyCap.loaded
                ? "text-style-caption text-danger-strong dark:text-danger"
                : "text-style-caption text-muted"
            }
            role={pushDailyCap.loaded ? "alert" : "status"}
          >
            {pushDailyCap.error}
          </p>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title={sergeantCopy.name}>
        <ToggleRow
          label={sergeantCopy.nudgesToggleLabel}
          description={sergeantCopy.nudgesToggleDescription}
          checked={sergeantNudges.value}
          onChange={(checked) => {
            // Дозвіл питаємо ДО запису: увімкнений на сервері канал без
            // дозволу браузера — це тиха підписка на нічого.
            if (checked && permStatus !== "granted") {
              void requestPermission();
            }
            void sergeantNudges.set(checked);
          }}
        />
        {/* Огляд 2026-09-04: до першого завантаження «помилка» — це гість
            («увійди, щоб…»), не збій. Червоним лишається лише збій
            збереження після успішного завантаження. */}
        {sergeantNudges.error && (
          <p
            className={
              sergeantNudges.loaded
                ? "text-style-caption text-danger-strong dark:text-danger"
                : "text-style-caption text-muted"
            }
            role={sergeantNudges.loaded ? "alert" : "status"}
          >
            {sergeantNudges.error}
          </p>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title="Рутина (звички)">
        <ToggleRow
          label="Нагадування про звички"
          description={backgroundHint(
            "Спрацьовує у час, вказаний у кожній звичці.",
          )}
          checked={routine.prefs?.routineRemindersEnabled === true}
          onChange={handleRoutineToggle}
        />
      </SettingsSubGroup>

      <SettingsSubGroup title="Фізрук (тренування)">
        <ToggleRow
          label="Нагадування про тренування"
          description={backgroundHint(
            "Надсилається о вказаній годині, якщо на сьогодні призначено тренування.",
          )}
          checked={monthlyPlan.reminderEnabled}
          onChange={handleFizrukToggle}
        />
        {monthlyPlan.reminderEnabled && (
          // Сирий `<input type="time">` тут стояв у flex-рядку без жодного
          // контракту ширини: нативний контрол має власний intrinsic
          // inline-size від локалі, а flex-комірка з дефолтним
          // `min-width: auto` під нього розширюється. `TimeField` несе цей
          // контракт (`min-w-0` + явний `inline-size: 100%`); обгортка
          // з фіксованою шириною потрібна тому, що корінь примітива — `w-full`
          // (у flex-рядку він тягнувся б на всю ширину), а ширина задана
          // явно, щоб трек не мав внеску від intrinsic-розміру контрола
          // взагалі. 9rem, а не «на око»: нативний time-контрол рендериться
          // під локаль ПРИСТРОЮ, не застосунку, і в en-US це `08:30 AM` —
          // 142px заміром у Chromium. Вужчий трек обрізав би суфікс саме тим
          // людям, у яких раніше поле було без обмеження взагалі.
          // Рецепт: docs/start/instructions/fix-mobile-horizontal-overflow.md
          <div className="flex items-center gap-2 text-style-label">
            <span className="shrink-0 text-subtle">Час</span>
            <div className="w-[9rem] shrink-0">
              <TimeField
                aria-label="Час"
                value={`${String(monthlyPlan.reminderHour).padStart(2, "0")}:${String(monthlyPlan.reminderMinute).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  monthlyPlan.setReminder(h || 0, m || 0);
                }}
              />
            </div>
          </div>
        )}
      </SettingsSubGroup>

      <SettingsSubGroup title="Їжа">
        <ToggleRow
          label="Нагадування про їжу"
          description={backgroundHint(
            "Щоденне нагадування записати прийоми їжі.",
          )}
          checked={Boolean(nutritionPrefs.reminderEnabled)}
          onChange={handleNutritionToggle}
        />
        {nutritionPrefs.reminderEnabled && (
          <label className="flex items-center gap-2 text-style-label">
            <span className="text-subtle">Година</span>
            <input
              type="number"
              min={0}
              max={23}
              className="w-16 h-9 touch-target rounded-xl bg-panel border border-line px-2 text-style-body text-text"
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
            <span className="text-style-caption text-subtle">год.</span>
          </label>
        )}
      </SettingsSubGroup>
    </SettingsGroup>
  );
}
