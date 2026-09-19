/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * Єдина точка входу для «я зважився» на web.
 *
 * W1-WEIGHT-SOT стадія 2. До цього дзеркалення ваги у профільний знімок
 * (`hub_biometrics_v1`, звідки nutrition бере вагу для TDEE) було
 * розсипане по чотирьох копіях і — головне — **відсутнє у двох писачів**:
 *
 *  - `useMeasurements.addEntry` (екран «Заміри») мосту не мав узагалі;
 *  - `chatActions/fizrukActions/measurements.ts` (AI-тул `log_measurement`
 *    з `weight_kg`) — теж.
 *
 * Через це зважування на «Замірах» або через `log_measurement` мовчки не
 * оновлювало КБЖВ-цілі. Тепер усі пʼять писачів ваги ходять сюди.
 *
 * ЩО ЦЕ НЕ РОБИТЬ: не обирає, куди лягає сам fizruk-запис (`fizruk_daily_log`
 * чи `fizruk_measurements`) — це вирішує викликач, як і раніше. Ця функція
 * лише тримає похідний профільний знімок (`hub_biometrics.weightKg`) у
 * синхроні з канонічним fizruk-журналом. SoT — `fizruk_measurements`
 * (ADR-0080, W1-WEIGHT-SOT стадії 3-4); профіль лишається головним входом,
 * не сховищем.
 *
 * Межа `MEASUREMENT_BOUNDS.weightKg` (20-400 кг, `@sergeant/shared`) —
 * та сама канонічна санітарна межа, яку `fizruk_measurements`-апплаєр
 * накладає на сервері (`invalid_weight_kg`). Ця функція — єдина точка
 * входу всіх пʼяти писачів ваги, тож саме тут її й тримати: писач може
 * не звірятись із межею сам, а профіль (і все, що з нього рахує TDEE)
 * все одно лишиться захищеним від фізично неможливого числа.
 */
import { MEASUREMENT_BOUNDS } from "@sergeant/shared";
import { mirrorWeightToBiometrics } from "./biometrics";

export interface RecordBodyWeightInput {
  /**
   * Вага в кілограмах. Нескінченні, недодатні значення та значення поза
   * `MEASUREMENT_BOUNDS.weightKg` ігноруються.
   */
  weightKg: number;
  /** ISO timestamp зважування; за замовчуванням — «зараз». */
  at?: string | undefined;
}

/**
 * Зафіксувати зважування на хаб-рівні (Last-Write-Wins за `at`).
 *
 * Ідемпотентна щодо сміттєвого вводу: не-число, `NaN`, `0`, відʼємне
 * значення чи значення поза канонічною межею `MEASUREMENT_BOUNDS.weightKg`
 * — no-op, щоб жоден писач не міг занести бите число в профіль.
 */
export function recordBodyWeight({
  weightKg,
  at,
}: RecordBodyWeightInput): void {
  if (typeof weightKg !== "number") return;
  if (!Number.isFinite(weightKg) || weightKg <= 0) return;
  const { min, max } = MEASUREMENT_BOUNDS.weightKg;
  if (weightKg < min || weightKg > max) return;
  mirrorWeightToBiometrics(weightKg, at ?? new Date().toISOString());
}
