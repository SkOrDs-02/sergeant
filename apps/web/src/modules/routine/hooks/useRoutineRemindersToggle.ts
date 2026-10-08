import { useCallback } from "react";
import { useToast } from "@shared/hooks/useToast";
import { requestNotificationPermission } from "@shared/hooks/useModuleReminder";

export type RoutinePermission = NotificationPermission | "unsupported";

/**
 * Поточний дозвіл браузера на сповіщення (`"unsupported"`, якщо API немає).
 * Читається синхронно: викликай під час рендеру, а не кешуй у state.
 */
export function readNotificationPermission(): RoutinePermission {
  return typeof Notification !== "undefined"
    ? Notification.permission
    : "unsupported";
}

/**
 * Єдиний шлях увімкнення/вимкнення «Нагадувань про звички»: тумблер у
 * Налаштування → Сповіщення і інлайн-підказка у формі звички
 * (`ReminderPresets`) викликають саме його, тож поведінка не розходиться.
 *
 * Вмикання спершу просить дозвіл браузера; без `granted` прапорець НЕ
 * ставиться, натомість показується попередження. Вимикання дозволу не
 * потребує. Повертає дозвіл, який побачив виклик (`null` при вимиканні),
 * щоб викликач міг оновити свій відображуваний статус.
 *
 * Канон routine §9: `routineRemindersEnabled` — opt-in, дефолт `false`;
 * сюди воно потрапляє лише за явною дією користувача.
 */
export function useRoutineRemindersToggle(
  updatePref: (key: string, value: unknown) => void,
) {
  const { warning: toastWarning } = useToast();

  return useCallback(
    async (checked: boolean): Promise<RoutinePermission | null> => {
      if (!checked) {
        updatePref("routineRemindersEnabled", false);
        return null;
      }
      const perm = await requestNotificationPermission();
      if (perm !== "granted") {
        toastWarning(
          "Без дозволу на сповіщення нагадування не надсилатимуться. Дозволь сповіщення у налаштуваннях браузера.",
        );
        return perm;
      }
      updatePref("routineRemindersEnabled", true);
      return perm;
    },
    [updatePref, toastWarning],
  );
}
