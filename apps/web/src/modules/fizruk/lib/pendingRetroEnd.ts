/**
 * Last validated: 2026-08-11
 * Status: Active
 * Відкладена мітка завершення для тренування, внесеного заднім числом.
 *
 * **Навіщо взагалі.** Ретро-форма питає і початок, і завершення, але саме
 * тренування мусить народитись НЕЗАВЕРШЕНИМ: крок «Завершити» — це не запис
 * `endedAt`, а весь післятренувальний потік (оцінка самопочуття, зони болю,
 * підсумок). Тренування, створене одразу з `endedAt`, малюється read-only
 * підсумком (`WorkoutJournalSection`), тож людина не може ні додати вправи,
 * ні пройти оцінку — рівно та скарга, з якої почалась ця правка.
 *
 * Тому введений кінець чекає тут, доки людина не натисне «Завершити», і аж
 * тоді підставляється замість `Date.now()`.
 *
 * **Чому sessionStorage, а не стан хука.** Між формою і кнопкою «Завершити»
 * лежить зміна маршруту (`workout/<id>` монтує свій `Workouts`), тож стан
 * оркестратора туди не доїжджає. Той самий прийом уже застосований поруч для
 * one-shot маркера маршруту (`fizruk_workout_new_route_v1`).
 *
 * **Чому не поле в сутності.** Це не властивість тренування, а незавершений
 * намір користувача. Поле означало б колонку, міграцію і синк-контракт заради
 * значення, яке живе хвилини й нікому, крім цього пристрою, не потрібне.
 *
 * Втрата запису не ламає нічого: `endWorkout` просто візьме поточний час, і
 * обидві мітки лишаються редагованими у `WorkoutTimeEditor` на підсумку.
 */
import {
  safeReadStringSS,
  safeRemoveSS,
  safeWriteSS,
} from "@shared/lib/storage/storage";

// Анотація нижче — інлайн, і саме тому: gitleaks зіставляє `gitleaks:allow`
// з РЯДКОМ знахідки, тож той самий текст рядком вище не гасить нічого. Це
// імʼя слота в sessionStorage; `generic-api-key` ловить його на ентропії
// (3.78), як уже ловив `nutrition_week_plan_v1` і `fizruk_measurements_v1`.
const KEY = "fizruk_pending_retro_end_v1"; // gitleaks:allow

interface PendingRetroEnd {
  workoutId: string;
  endedAt: string;
}

/** Слот один: два ретро-тренування одночасно заповнювати неможливо. */
export function setPendingRetroEnd(workoutId: string, endedAt: string): void {
  safeWriteSS(KEY, JSON.stringify({ workoutId, endedAt }));
}

function read(): PendingRetroEnd | null {
  const raw = safeReadStringSS(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingRetroEnd>;
    if (typeof parsed.workoutId !== "string") return null;
    if (typeof parsed.endedAt !== "string") return null;
    if (Number.isNaN(Date.parse(parsed.endedAt))) return null;
    return { workoutId: parsed.workoutId, endedAt: parsed.endedAt };
  } catch {
    // Пошкоджений запис читаємо як його відсутність — гірше за втрату мітки
    // був би кидок посеред завершення тренування.
    return null;
  }
}

/** Читає, не споживаючи — для показу тривалості, поки сесія заповнюється. */
export function peekPendingRetroEnd(workoutId: string): string | null {
  const pending = read();
  return pending && pending.workoutId === workoutId ? pending.endedAt : null;
}

/**
 * Читає і одразу гасить. Викликається рівно у `endWorkout`, тож будь-який
 * шлях завершення (кнопка, діалог конфлікту, дашборд) поводиться однаково.
 */
export function takePendingRetroEnd(workoutId: string): string | null {
  const pending = read();
  if (!pending || pending.workoutId !== workoutId) return null;
  safeRemoveSS(KEY);
  return pending.endedAt;
}

/** Ретро викинули, не завершивши — мітка не має пережити його. */
export function clearPendingRetroEnd(workoutId: string): void {
  const pending = read();
  if (pending && pending.workoutId === workoutId) safeRemoveSS(KEY);
}
