/**
 * Last validated: 2026-07-25
 * Status: Active
 * Owner: @Skords-01
 *
 * Леджер «останній показаний продуктовий сигнал» — інфраструктура атрибуції
 * для петель цінності Хвилі 2.
 *
 * Один писар: `InsightCard` викликає `markSignalShown()` тоді ж, коли емітить
 * `value_signal_shown`. Читачі — майбутні action-події
 * (`routine_habit_checked`, `fizruk_workout_finished`, `nutrition_meal_logged`,
 * `finyk_tx_categorized`), які дописують собі поля атрибуції
 * `after_signal` / `ms_since_signal` / `signal`
 * (контракт — `packages/shared/src/lib/analyticsEvents.valueLoops.ts` §2).
 *
 * ## Чому саме так
 *
 * - **Вікно N у код НЕ зашите.** Ми емітимо СИРИЙ `ms_since_signal`, а «дія
 *   протягом N» рахується у PostHog-запиті. Тому N можна переглянути заднім
 *   числом, не переливаючи бандл, і питання «яке N правильне» перестає бути
 *   блокером коду. TTL леджера — 24 год і це НЕ «вікно N»: це лише межа, за
 *   якою запис вважається протухлим і нерелевантним.
 * - **Читання НЕ очищає стан.** Кілька дій після одного показу — валідний
 *   продуктовий кейс (побачив «білок низький» → залогував два прийоми їжі).
 *   Consume-семантика зарахувала б лише перший і занизила конверсію.
 * - **Час — device-local (ADR-0078).** `Date.now()` обох кінців — це той
 *   самий пристрій і та сама вкладка, тож різниця коректна. Крос-девайсного
 *   порівняння timestamps тут немає і бути не може.
 * - **sessionStorage, не localStorage.** Дзеркало переживає reload вкладки
 *   (PWA-оновлення, повернення з банківського redirect-у), але НЕ переживає
 *   закриття вкладки — «сигнал бачив учора» не має зараховуватись сьогодні.
 *   Запис іде через `safeWriteSS`/`safeReadStringSS`, тож private-mode Safari
 *   і вимкнене сховище деградують до in-memory без throw.
 */

import {
  safeReadStringSS,
  safeWriteSS,
  safeRemoveSS,
} from "@shared/lib/storage/storage";

const STORAGE_KEY = "sergeant.v2.valueSignal.lastShown";

/**
 * Межа протухання запису. Щедра навмисно: реальне вікно N обирається у
 * PostHog. НЕ інтерпретувати як «дія в межах N».
 */
const TTL_MS = 24 * 60 * 60 * 1000;

export interface ShownSignalRecord {
  /** Стабільний kind сигналу (`parseInsightId`), НЕ сирий insight id. */
  signal: string;
  /** Модуль-власник сигналу. */
  module: string;
  /** `Date.now()` моменту показу — device-local (ADR-0078). */
  at: number;
}

/**
 * Поля атрибуції в тому вигляді, в якому вони їдуть у payload action-події.
 * Імена — snake_case, бо це property-и PostHog, а не внутрішній API.
 */
export interface SignalAttribution {
  after_signal: boolean;
  ms_since_signal: number | null;
  signal: string | null;
}

const NO_ATTRIBUTION: SignalAttribution = Object.freeze({
  after_signal: false,
  ms_since_signal: null,
  signal: null,
});

// Module-level стор — джерело правди в межах життя вкладки; sessionStorage
// лише дзеркало на випадок reload-у.
let lastShown: ShownSignalRecord | null = null;

function isRecord(value: unknown): value is ShownSignalRecord {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Partial<ShownSignalRecord>;
  return (
    typeof rec.signal === "string" &&
    typeof rec.module === "string" &&
    typeof rec.at === "number" &&
    Number.isFinite(rec.at)
  );
}

function readMirror(): ShownSignalRecord | null {
  const raw = safeReadStringSS(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Зафіксувати показ сигналу. Fire-and-forget, ніколи не кидає — викликається
 * з рендер-шляху `InsightCard` поряд із `trackEvent`.
 */
export function markSignalShown(input: {
  signal: string;
  module: string;
}): void {
  if (!input || typeof input.signal !== "string" || !input.signal) return;
  const record: ShownSignalRecord = {
    signal: input.signal,
    module: typeof input.module === "string" ? input.module : "unknown",
    at: Date.now(),
  };
  lastShown = record;
  try {
    safeWriteSS(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* дзеркало best-effort — in-memory стор уже оновлено */
  }
}

/**
 * Прочитати поля атрибуції для action-події.
 *
 * @param module - Коли переданий, атрибуція зараховується ЛИШЕ якщо останній
 *   показаний сигнал належить цьому ж модулю. Без цієї перевірки показ
 *   finyk-сигналу зарахувався б чекіну звички в routine і петля збрехала б.
 *   Без аргументу — крос-модульна атрибуція (свідомо ширша).
 */
export function readSignalContext(module?: string): SignalAttribution {
  const record = lastShown ?? readMirror();
  if (!record) return NO_ATTRIBUTION;
  // Гідратуємо in-memory стор після reload-у, щоб не парсити JSON щоразу.
  lastShown = record;

  const delta = Date.now() - record.at;
  // Негативна дельта = зсув годинника / зіпсоване дзеркало → не атрибутуємо.
  if (!Number.isFinite(delta) || delta < 0 || delta > TTL_MS) {
    return NO_ATTRIBUTION;
  }
  if (typeof module === "string" && module && record.module !== module) {
    return NO_ATTRIBUTION;
  }

  return {
    after_signal: true,
    ms_since_signal: delta,
    signal: record.signal,
  };
}

/**
 * Скинути леджер. Потрібен тестам і будь-якому майбутньому logout/purge-шляху
 * (атрибуція одного акаунта не має протікати в наступний на тому ж пристрої).
 */
export function resetSignalAttribution(): void {
  lastShown = null;
  safeRemoveSS(STORAGE_KEY);
}
