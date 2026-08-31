/**
 * Last validated: 2026-07-25
 * Status: Active
 * Owner: @Skords-01
 *
 * Телеметрія AI-поради (Хвиля 2, картка W2-AI-ADVICE-EVENTS, стадія 1).
 *
 * Один писар на три події — `ai_advice_shown`, `ai_advice_reacted` і
 * `ai_advice_failed` (контракт:
 * `packages/shared/src/lib/analyticsEvents.valueLoops.ts` §3).
 * Клієнти показу й реакції: `AssistantAdviceCard` (`source: "coach_insight"`)
 * і `WeeklyDigestCard` (`source: "weekly_digest"`). Провал емітять самі хуки
 * (`useCoachInsight`, `useWeeklyDigest`) — картка про нього не знає, бо при
 * помилці вона просто не рендериться.
 *
 * ## Чому саме так
 *
 * - **Тіла поради тут немає і не буде.** У payload їде лише `chars`.
 *   `scrubPII` (`packages/shared/src/lib/pii.ts`) чистить за ІМЕНАМИ ключів,
 *   тож поле з текстом поради він НЕ виріже — захист мусить бути контрактом,
 *   а не сподіванням на скраб (Hard Rule #21). Порада — вільний український
 *   текст про фінанси/тіло/харчування конкретної людини.
 * - **`advice_id` — випадковий uuid, а НЕ хеш тексту.** Хеш перетворив би
 *   подію на приховану сигнатуру змісту, тобто на той самий витік іншими
 *   словами.
 * - **Показ ≠ mount.** `markAdviceShown` викликається лише тоді, коли текст
 *   РЕАЛЬНО видимий: перевірку видимості робить call-site (див.
 *   `AssistantAdviceCard` — подвійний collapse), а тут стоїть лише
 *   once-guard. Impression на mount роздув би знаменник у рази і «цінність
 *   AI» вийшла б штучно низькою НАЗАВЖДИ — переписати історію подій не можна.
 * - **Guard — page-load scope, не localStorage.** Той самий прецедент, що в
 *   `InsightCard` (`shownOnce`): persistent-прапорці в LS дають хибну
 *   поведінку після очищення браузера, а PostHog дедуплікує за `distinct_id`.
 * - **Час — device-local (ADR-0078).** `day_key` — день ПРИСТРОЮ, а не UTC;
 *   `seconds_since_shown` — різниця двох `Date.now()` тієї самої вкладки.
 *
 * ## Обмеження, яке треба знати ДО побудови дашборда
 *
 * `advice_id` тут КЛІЄНТСЬКИЙ. Одна й та сама денна порада, відкрита у вебі
 * й на телефоні, дасть ДВА різні id. Це прийнятно для метрики
 * «побачив → зреагував» (міряємо покази), але НЕПРИДАТНЕ для «скільки
 * унікальних порад згенеровано» — серверний id це виправляє (стадія 3,
 * гейт founder-а).
 */

import { ANALYTICS_EVENTS, trackEvent } from "./analytics";
import { deviceDayKey } from "@sergeant/shared";

/**
 * Версія інструментації. Бампається, коли змінюється СЕМАНТИКА показу або
 * набір реакцій (не косметика).
 *
 * Навіщо в payload: PWA з service-worker (`apps/web/src/sw/`) означає, що
 * частина сесій ще крутить старий бандл і не шле подій узагалі. Без цього
 * поля когорту «до повного розкату» неможливо відрізати — лишиться гадання
 * про знаменник.
 */
export const ADVICE_INSTRUMENTATION_VERSION = 1;

/** Джерело поради — enum контракту `ai_advice_shown`. */
export type AdviceSource = "coach_insight" | "weekly_digest";

/** Реакція — дискримінатор контракту `ai_advice_reacted`. */
export type AdviceReaction = "ask_ai" | "refresh" | "collapse" | "expand";

/**
 * Поверхня показу — property `surface` події `ai_advice_shown`.
 *
 * Літеральний union, а не `string`: контракт заморожений, і одрук у поверхні
 * розділив би один зріз на два мовчки — дашборд показав би просто менше
 * показів, без жодної помилки. Нову поверхню додавай СЮДИ, тоді компілятор
 * покаже всі місця, де її треба врахувати.
 */
export type AdviceSurface = "hub_dashboard" | "hub_reports";

/**
 * id, для яких `ai_advice_shown` уже полетів у цьому завантаженні сторінки.
 * Гасить і повторні mount/unmount карток, і подвійний mount під StrictMode.
 */
const shownOnce = new Map<string, number>();

/** Стабільні id за scope-ом (див. `adviceIdForScope`). */
const idsByScope = new Map<string, string>();

/** Лічильник для fallback-ID (див. `newAdviceId`). Скидається з сесією. */
let adviceIdCounter = 0;

/**
 * Унікальний id поради. НІКОЛИ не похідна від тексту поради.
 *
 * Експортується навмисно: `useCoachInsight` мусить генерувати id тим самим
 * способом, інакше друга копія цієї функції рано чи пізно розійдеться з
 * першою (перша ітерація цієї Хвилі саме так і залишила `Math.random()` в
 * одному з двох місць).
 */
export function newAdviceId(): string {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {
    /* деякі WebView-и кидають на доступі до crypto — падаємо у fallback */
  }
  // Fallback БЕЗ `Math.random()`: CodeQL справедливо позначає його як
  // insecure-randomness, і сперечатись тут нема про що — для correlation-ID
  // випадковість не потрібна взагалі. Монотонний лічильник у межах сесії дає
  // те, чого random не гарантує: відсутність колізій усіченого суфікса.
  adviceIdCounter += 1;
  return `adv-${Date.now().toString(36)}-${adviceIdCounter.toString(36)}`;
}

/**
 * Стабільний у межах завантаження сторінки `advice_id` для порад, які не
 * мають власного персистентного id (сьогодні — тижневий дайджест).
 *
 * `scope` мусить ідентифікувати саму пораду (наприклад
 * `weekly_digest:2026-W30:<generatedAt>`), а НЕ її текст: id живе рівно
 * стільки, скільки живе згенерована порада, і не є її сигнатурою.
 */
export function adviceIdForScope(scope: string): string {
  const existing = idsByScope.get(scope);
  if (existing) return existing;
  const id = newAdviceId();
  idsByScope.set(scope, id);
  return id;
}

export interface AdviceShownInput {
  adviceId: string;
  source: AdviceSource;
  /** Де саме побачили. */
  surface: AdviceSurface;
  /** Довжина тексту поради. САМ ТЕКСТ у payload не потрапляє ніколи. */
  chars: number;
}

/**
 * Зафіксувати ФАКТИЧНИЙ показ поради. Ідемпотентна в межах завантаження
 * сторінки: другий виклик із тим самим `adviceId` — no-op.
 *
 * Call-site зобовʼязаний перевірити видимість ДО виклику (розгорнута секція,
 * розгорнута картка, текст наявний). Тут перевіряється лише дедуплікація.
 */
export function markAdviceShown(input: AdviceShownInput): boolean {
  const { adviceId, source, surface, chars } = input;
  if (typeof adviceId !== "string" || !adviceId) return false;
  if (shownOnce.has(adviceId)) return false;
  shownOnce.set(adviceId, Date.now());
  trackEvent(ANALYTICS_EVENTS.AI_ADVICE_SHOWN, {
    advice_id: adviceId,
    source,
    surface,
    day_key: deviceDayKey(),
    chars: Number.isFinite(chars) ? Math.max(0, Math.round(chars)) : 0,
    instrumentation_version: ADVICE_INSTRUMENTATION_VERSION,
  });
  return true;
}

/**
 * Зафіксувати реакцію на пораду.
 *
 * `seconds_since_shown` = 0 означає «показу в цьому завантаженні сторінки не
 * зафіксовано». За конструкцією це рівно випадок `reaction: "expand"`: клік,
 * який РОБИТЬ текст видимим, відбувається ДО impression-ефекту. Дискримінатор
 * `reaction` дозволяє відрізати цей випадок на боці дашборда — тому окремого
 * поля-прапорця не заводимо (контракт заморожений).
 */
export function trackAdviceReaction(
  adviceId: string | null | undefined,
  reaction: AdviceReaction,
): boolean {
  // Без id реакцію нікуди атрибутувати — краще не емітити, ніж емітити
  // подію-сироту, яка роздує чисельник без відповідного знаменника.
  if (typeof adviceId !== "string" || !adviceId) return false;
  const shownAt = shownOnce.get(adviceId);
  const delta = typeof shownAt === "number" ? Date.now() - shownAt : 0;
  trackEvent(ANALYTICS_EVENTS.AI_ADVICE_REACTED, {
    advice_id: adviceId,
    reaction,
    seconds_since_shown:
      Number.isFinite(delta) && delta > 0 ? Math.round(delta / 1000) : 0,
  });
  return true;
}

/**
 * Тип збою генерації — дискримінатор контракту `ai_advice_failed`.
 *
 * Перші чотири значення дзеркалять `ApiErrorKind` (`packages/api-client`) і
 * `HUBCHAT_ERROR.kind` — один словник збоїв на весь AI-шар, інакше зріз
 * «чому AI не спрацював» довелося б збирати з двох несумісних enum-ів.
 * `unknown` — для не-`ApiError` викидів (баг у нашому коді, не в мережі).
 */
export type AdviceFailureKind =
  "http" | "network" | "parse" | "aborted" | "unknown";

export interface AdviceFailedInput {
  source: AdviceSource;
  kind: AdviceFailureKind;
  /** HTTP-статус, коли він відомий. `null` для мережевих збоїв. */
  status: number | null;
}

/**
 * Зафіксувати ПРОВАЛ генерації поради.
 *
 * Дедуплікації тут навмисно немає, на відміну від `markAdviceShown`: показ
 * ідемпотентний за `advice_id`, а провал власного id не має — і кожна невдала
 * спроба це окремий факт. React Query ретраїть максимум раз (див.
 * `useCoachInsight`), тож сплеск подій обмежений зверху самим викликом.
 *
 * Текст помилки в payload не потрапляє: повідомлення провайдера може містити
 * фрагмент промпту, тобто дані користувача.
 */
export function trackAdviceFailed(input: AdviceFailedInput): void {
  const { source, kind, status } = input;
  trackEvent(ANALYTICS_EVENTS.AI_ADVICE_FAILED, {
    source,
    kind,
    status:
      typeof status === "number" && Number.isFinite(status) ? status : null,
    instrumentation_version: ADVICE_INSTRUMENTATION_VERSION,
  });
}

/** Скидання guard-ів між тестами. Не для продакшн-шляхів. */
export function __resetAdviceTelemetry(): void {
  shownOnce.clear();
  idsByScope.clear();
}
