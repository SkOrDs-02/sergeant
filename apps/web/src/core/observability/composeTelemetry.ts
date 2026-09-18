/**
 * Last validated: 2026-09-01
 * Status: Active
 * Owner: @Skords-01
 *
 * Телеметрія тертя запису — «від кнопки до збереженого»
 * (контракт: `packages/shared/src/lib/analyticsEvents.valueLoops.ts` §6).
 *
 * Одна подія `entry_compose_finished` на закриття форми запису, з
 * дискримінатором `module` і сирою тривалістю. Клієнти сьогодні:
 * `AddMealSheet` (nutrition, `entry_kind: "meal"`) і `LogPastWorkoutSheet`
 * (fizruk, `entry_kind: "past_workout"`).
 *
 * ## Навіщо це існує
 *
 * `nutrition_meal_logged` і `fizruk_workout_finished` відповідають «скільки
 * записів». Жодна подія не відповідає «скільки це коштувало людині» — а
 * саме цим міряють себе конкуренти (Dr. Muscle публічно оптимізує
 * time-to-first-set, MacroFactor продає «на 50 % менше тапів»). Поки цього
 * виміру немає, будь-яке спрощення форми не можна ні довести, ні
 * спростувати — воно лишається питанням смаку.
 *
 * ## Чому саме так
 *
 * - **Кинуті композиції емітяться теж.** Форма, яку закрили без збереження,
 *   без `outcome: "abandoned"` виглядала б просто як відсутність запису, і
 *   «швидко» не відрізнялось би від «здався». Це знаменник, без якого
 *   медіана хвалить сама себе.
 * - **`backgrounded` замість порога.** Розподіл часу запису інакше
 *   визначають не форми, а люди, які пішли по каву з відкритим шитом.
 *   Прапорець дозволяє відрізати такі сесії НА ДАШБОРДІ; у коді порога
 *   немає, подія летить навіть з інтервалом у півгодини (те саме правило
 *   сирих значень, що `ms_since_signal` у §2 контракту).
 * - **Вмісту запису в payload немає** — ні назви страви, ні ваги, ні вправ.
 *   `scrubPII` чистить за ІМЕНАМИ ключів, тож поле з назвою він НЕ вирізав
 *   би (Hard Rule #21); захист тут — контракт, а не сподівання на скраб.
 * - **Перехід, а не монтування.** `useComposeTelemetry` реагує на ЗМІНУ
 *   `open`, і не має cleanup-функції на розмонтуванні. Причина — StrictMode:
 *   у dev ефект виконується двічі з cleanup-ом між ними, тож прив'язка
 *   «begin на ефект / end на cleanup» емітила б фантомний `abandoned` на
 *   кожне відкриття.
 *
 * ## Відома межа
 *
 * Композиція, кинута закриттям вкладки, НЕ емітиться: `pagehide` не дає
 * надійної доставки, а половина подій гірша за їхню відсутність — вона
 * мовчки зсуває знаменник. Така сирота флашиться як `abandoned` при
 * наступному відкритті тієї самої форми (див. `beginCompose`), тобто
 * втрачається лише остання перед виходом.
 */

import { useEffect, useRef } from "react";
import { ANALYTICS_EVENTS, trackEvent } from "./analytics";

/**
 * Версія інструментації. Бампається, коли змінюється СЕМАНТИКА виміру
 * (що вважається початком, що результатом), а не набір поверхонь.
 *
 * Навіщо в payload: PWA з service-worker означає, що частина сесій ще
 * крутить старий бандл і не шле подій узагалі. Без цього поля когорту
 * «ще не розкатано» неможливо відрізати від «форму не відкривали».
 */
export const COMPOSE_INSTRUMENTATION_VERSION = 1;

/**
 * Модуль-власник форми. Літеральний union, а не `string`: одрук розділив би
 * один зріз на два мовчки — дашборд показав би просто менше композицій, без
 * жодної помилки.
 */
export type ComposeModule = "nutrition" | "fizruk";

export interface ComposeMeta {
  module: ComposeModule;
  /**
   * СТАБІЛЬНИЙ вид запису без змінного суфікса: `meal`, `past_workout`
   * (а НЕ `meal-<mealId>`). Той самий контракт, що `signal` у §1: сирий id
   * — це high-cardinality property у PostHog, а в кастомних назвах ще й
   * potential PII.
   */
  entryKind: string;
  /** Звідки відкрито форму: `fab`, `quick_chip`, `journal`, … */
  surface: string;
}

interface OpenCompose extends ComposeMeta {
  startedAt: number;
  backgrounded: boolean;
  saved: boolean;
}

const openComposes = new Map<string, OpenCompose>();

let visibilityAttached = false;

function documentRef(): Document | null {
  return typeof document === "undefined" ? null : document;
}

/** Позначає ВСІ відкриті композиції, якщо вкладку сховали. */
function handleVisibilityChange(): void {
  const doc = documentRef();
  if (!doc || doc.visibilityState !== "hidden") return;
  for (const entry of openComposes.values()) entry.backgrounded = true;
}

function ensureVisibilityListener(): void {
  if (visibilityAttached) return;
  const doc = documentRef();
  if (!doc) return;
  doc.addEventListener("visibilitychange", handleVisibilityChange);
  visibilityAttached = true;
}

function isHiddenNow(): boolean {
  const doc = documentRef();
  return doc ? doc.visibilityState === "hidden" : false;
}

/**
 * Почати вимір. Ідемпотентність тут НЕ підходить: якщо під ключем уже
 * висить композиція, вона — сирота (форму лишили відкритою й пішли зі
 * сторінки), і її треба закрити як `abandoned`, а не мовчки затерти.
 * Інакше кинуті записи зникали б зі знаменника саме в тих сесіях, де
 * тертя найбільше.
 */
export function beginCompose(key: string, meta: ComposeMeta): void {
  if (!key) return;
  if (openComposes.has(key)) endCompose(key);
  ensureVisibilityListener();
  openComposes.set(key, {
    ...meta,
    startedAt: Date.now(),
    backgrounded: isHiddenNow(),
    saved: false,
  });
}

/**
 * Позначити, що композиція завершилась збереженням. Викликається З
 * ОБРОБНИКА ЗБЕРЕЖЕННЯ, до закриття форми: саме закриття потім емітить
 * подію і прочитає цей прапорець.
 *
 * Розділення на «позначити» і «завершити» тут не церемонія: обробник
 * збереження і закриття форми — різні місця в різних файлах
 * (`useNutritionLog.handleAddMeal` проти `NutritionOverlays.onClose`), і
 * зшивати їх прапорцем надійніше, ніж домовлятись про порядок викликів.
 */
export function markComposeSaved(key: string): void {
  const entry = openComposes.get(key);
  if (entry) entry.saved = true;
}

/**
 * Завершити вимір і емітнути подію. Повертає `false`, якщо під ключем
 * нічого не було — це нормальний випадок (форма закрилась двічі, або
 * закриття прилетіло після флашу сироти), а не помилка.
 */
export function endCompose(key: string): boolean {
  const entry = openComposes.get(key);
  if (!entry) return false;
  openComposes.delete(key);

  const elapsed = Date.now() - entry.startedAt;
  trackEvent(ANALYTICS_EVENTS.ENTRY_COMPOSE_FINISHED, {
    module: entry.module,
    entry_kind: entry.entryKind,
    surface: entry.surface,
    outcome: entry.saved ? "saved" : "abandoned",
    ms: Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0,
    backgrounded: entry.backgrounded,
    instrumentation_version: COMPOSE_INSTRUMENTATION_VERSION,
  });
  return true;
}

export interface UseComposeTelemetryInput extends ComposeMeta {
  /** Стабільний ключ форми — той самий на всіх її відкриттях. */
  key: string;
  /** Чи форма зараз відкрита. Вимір ведеться по ЗМІНАХ цього прапорця. */
  open: boolean;
}

/**
 * React-обгортка: починає вимір на переході `open` false → true і завершує
 * на true → false.
 *
 * Cleanup-функції немає навмисно — див. § «Чому саме так» у шапці файла
 * (StrictMode подвоює ефекти й фантомний `abandoned` летів би на кожне
 * відкриття в dev).
 */
export function useComposeTelemetry(input: UseComposeTelemetryInput): void {
  const { key, open, module, entryKind, surface } = input;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    // Мета в залежностях, але вихід за незмінним `open` — тобто зміна
    // `entryKind` чи `surface` під час відкритої форми не рестартує вимір,
    // а просто нічого не робить. Так меті не потрібен ref (запис у ref під
    // час рендеру заборонений `react-hooks/refs`), і при цьому вимір
    // лишається привʼязаним до ПЕРЕХОДУ, а не до кожного ререндеру.
    const wasOpen = wasOpenRef.current;
    if (open === wasOpen) return;
    wasOpenRef.current = open;
    if (open) beginCompose(key, { module, entryKind, surface });
    else endCompose(key);
  }, [key, open, module, entryKind, surface]);
}

/** Скидання стану між тестами. Не для продакшн-шляхів. */
export function __resetComposeTelemetry(): void {
  openComposes.clear();
  const doc = documentRef();
  if (doc && visibilityAttached) {
    doc.removeEventListener("visibilitychange", handleVisibilityChange);
  }
  visibilityAttached = false;
}
