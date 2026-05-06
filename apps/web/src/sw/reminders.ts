/// <reference lib="WebWorker" />
/**
 * Local reminder loop (routine / fizruk / nutrition).
 *
 * Виокремлено з sw.ts (initiative 0001 Phase 2 — module decomposition).
 *
 * Кожна хвилина (вирівняно по поточному менш-як-1-секундному
 * `msToNextMinute`) ми перевіряємо три домени, що зберігають свій
 * стан в IndexedDB / `localStorage`. Якщо є запланована напоминалка
 * на цю хвилину — викликаємо `showNotification` через registration і
 * зберігаємо storage-key у dedup-set, щоб не вистрелити двічі.
 */

import {
  loadNotifiedKeys,
  notifiedKeys,
  pruneOldNotifiedKeys,
  recordNotified,
} from "./notifiedKeys";

declare const self: ServiceWorkerGlobalScope;

// ─── Types ─────────────────────────────────────────────────────────────────

type SwRoutineHabit = {
  id: string;
  name: string;
  emoji?: string;
  archived?: boolean;
  recurrence?: string;
  startDate?: string;
  endDate?: string | null;
  weekdays?: number[];
  reminderTimes?: unknown[];
  timeOfDay?: string;
};

type SwRoutineState = {
  prefs?: { routineRemindersEnabled?: boolean };
  habits?: SwRoutineHabit[];
  completions?: Record<string, string[]>;
};

type SwFizrukState = {
  reminderEnabled?: boolean;
  reminderHour?: number;
  reminderMinute?: number;
  days?: Record<string, { templateId?: string } | undefined>;
};

type SwNutritionState = {
  reminderEnabled?: boolean;
  reminderHour?: number;
};

const ROUTINE_NOTIFY_PREFIX = "routine_notify_";

let routineData: SwRoutineState | null = null;
let fizrukData: SwFizrukState | null = null;
let nutritionData: SwNutritionState | null = null;
let scheduledTimerId: ReturnType<typeof setTimeout> | null = null;

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function currentHm() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}

function habitScheduledOnDateSW(h: SwRoutineHabit, dk: string) {
  if (!h || h.archived) return false;
  if (h.startDate && dk < h.startDate) return false;
  if (h.endDate && dk > h.endDate) return false;
  const rec = h.recurrence || "daily";
  if (rec === "daily") return true;
  if (rec === "once") return dk === h.startDate;
  if (rec === "weekly") {
    const d = new Date(dk + "T12:00:00");
    const wd = (d.getDay() + 6) % 7;
    return Array.isArray(h.weekdays) && h.weekdays.includes(wd);
  }
  if (rec === "monthly") {
    // `?? "01"` / `?? 0` defaults are unreachable — both `dk` and
    // `h.startDate` are produced by `todayKey()` / ISO-date inputs,
    // so the `YYYY-MM-DD` split always has 3 parts. They exist only
    // to satisfy `noUncheckedIndexedAccess: true` in the host
    // tsconfig that the staged pre-commit typecheck walks up to
    // (the SW build itself uses the looser `tsconfig.sw.json`).
    const startDay = h.startDate
      ? parseInt(h.startDate.split("-")[2] ?? "01", 10)
      : 1;
    const dkDay = parseInt(dk.split("-")[2] ?? "01", 10);
    const [y = 0, m = 0] = dk.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return startDay > lastDay ? dkDay === lastDay : dkDay === startDay;
  }
  return true;
}

function normalizeReminderTimesSW(h: SwRoutineHabit): string[] {
  if (Array.isArray(h.reminderTimes) && h.reminderTimes.length > 0) {
    return h.reminderTimes.filter(
      (t): t is string => typeof t === "string" && /^\d{2}:\d{2}$/.test(t),
    );
  }
  const legacy = h.timeOfDay && String(h.timeOfDay).trim();
  if (legacy && /^\d{2}:\d{2}$/.test(legacy)) return [legacy];
  return [];
}

// ─── Per-domain checks ─────────────────────────────────────────────────────

function checkRoutineReminders() {
  if (!routineData) return;
  if (routineData.prefs?.routineRemindersEnabled !== true) return;

  const dk = todayKey();
  const hm = currentHm();
  const habits = routineData.habits || [];
  const completions = routineData.completions || {};

  for (const h of habits) {
    if (h.archived) continue;
    const times = normalizeReminderTimesSW(h);
    if (times.length === 0) continue;
    if (!times.includes(hm)) continue;
    if (!habitScheduledOnDateSW(h, dk)) continue;
    const hCompletions = completions[h.id] || [];
    if (hCompletions.includes(dk)) continue;

    const storageKey = `${ROUTINE_NOTIFY_PREFIX}${h.id}_${hm}_${dk}`;
    if (notifiedKeys.has(storageKey)) continue;
    recordNotified(storageKey);

    const title = `${h.emoji || "✓"} ${h.name}`;
    self.registration
      .showNotification(title, {
        body: "Нагадування про звичку",
        tag: storageKey,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        requireInteraction: false,
        data: { action: "open", module: "routine" },
      })
      .catch(() => {});
  }
}

function checkFizrukReminders() {
  if (!fizrukData) return;
  if (!fizrukData.reminderEnabled) return;

  const dk = todayKey();
  const hm = currentHm();
  const todayEntry = fizrukData.days?.[dk];
  if (!todayEntry?.templateId) return;

  const rh = Number.isFinite(fizrukData.reminderHour)
    ? fizrukData.reminderHour
    : 18;
  const rm = Number.isFinite(fizrukData.reminderMinute)
    ? fizrukData.reminderMinute
    : 0;
  const targetHm = `${String(rh).padStart(2, "0")}:${String(rm).padStart(2, "0")}`;
  if (hm !== targetHm) return;

  const storageKey = `fizruk_notify_${dk}`;
  if (notifiedKeys.has(storageKey)) return;
  recordNotified(storageKey);

  self.registration
    .showNotification("Фізрук — тренування", {
      body: "Заплановане тренування на сьогодні. Відкрий застосунок, щоб стартувати.",
      tag: storageKey,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: false,
      data: { action: "open", module: "fizruk" },
    })
    .catch(() => {});
}

function checkNutritionReminders() {
  if (!nutritionData) return;
  if (!nutritionData.reminderEnabled) return;

  const dk = todayKey();
  const hm = currentHm();
  const rh = Number.isFinite(nutritionData.reminderHour)
    ? nutritionData.reminderHour
    : 12;
  const targetHm = `${String(rh).padStart(2, "0")}:00`;
  if (hm !== targetHm) return;

  const storageKey = `nutrition_notify_${dk}`;
  if (notifiedKeys.has(storageKey)) return;
  recordNotified(storageKey);

  self.registration
    .showNotification("Харчування", {
      body: "Час відмітити прийом їжі! Відкрий застосунок.",
      tag: storageKey,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      requireInteraction: false,
      data: { action: "open", module: "nutrition" },
    })
    .catch(() => {});
}

// ─── Public API ────────────────────────────────────────────────────────────

export function checkReminders(): void {
  pruneOldNotifiedKeys(todayKey());
  checkRoutineReminders();
  checkFizrukReminders();
  checkNutritionReminders();
}

function scheduleNextCheck(): void {
  if (scheduledTimerId) clearTimeout(scheduledTimerId);
  const now = new Date();
  const msToNextMinute =
    (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 50;
  scheduledTimerId = setTimeout(() => {
    checkReminders();
    scheduleNextCheck();
  }, msToNextMinute);
}

/**
 * Make sure we have replayed any persisted dedup keys from a previous
 * SW generation before the first check runs, so we don't re-fire the
 * current-minute notification on cold start.
 */
export function startReminderLoop(): void {
  loadNotifiedKeys()
    .then(() => {
      checkReminders();
      scheduleNextCheck();
    })
    .catch(() => {
      checkReminders();
      scheduleNextCheck();
    });
}

export function setRoutineData(state: SwRoutineState | null): void {
  routineData = state;
}

export function setFizrukData(state: SwFizrukState | null): void {
  fizrukData = state;
}

export function setNutritionData(state: SwNutritionState | null): void {
  nutritionData = state;
}

export function getReminderState(): {
  hasRoutine: boolean;
  hasFizruk: boolean;
  hasNutrition: boolean;
} {
  return {
    hasRoutine: !!routineData,
    hasFizruk: !!fizrukData,
    hasNutrition: !!nutritionData,
  };
}
