/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Класифікація помилок sync-тіка перед відправкою в Sentry.
 *
 * Проблема, яку це закриває (прод, бета 10–27.08). Обидва тіки —
 * `sync-v2-push-tick` (`syncEngineWriter`) і `sync-v2-pull-tick`
 * (`syncEngineReader`) — віддавали в `captureException` БУДЬ-ЯКУ помилку.
 * Для застосунку, який за задумом працює офлайн, це означає, що
 * зірваний мережею тік їде в Sentry як `error`. Так виникли
 * `SERGEANT-API-C` (10 користувачів), `SERGEANT-WEB-G` (7) і хвіст із
 * `API-K` / `API-S` / `API-Y` / `WEB-P` — усі з тим самим текстом
 * `TypeError: Load failed` (це формулювання Safari для зірваного
 * `fetch`) і всі БЕЗ стектрейсу.
 *
 * AI-CONTEXT: відсутність стектрейсу — не дрібниця, а суть. Без нього
 * `TypeError: Load failed` не відрізнити від провального динамічного
 * імпорту, який Safari називає так само. Тобто в одну issue злипались
 * два різні світи: «телефон у метро» і «стейл-асет після деплою» (та
 * сама родина, що дала баг із wasm). Тому цей модуль не просто глушить
 * шум — він додає до події рівно ті поля, якими ці два випадки
 * розрізняються.
 *
 * AI-DANGER: глушимо лише коли браузер САМ каже, що інтерфейсу немає
 * (`navigator.onLine === false`). Це не власна евристика, а вже
 * ратифіковане в репо правило: докстрінг `isOnline` у
 * `packages/api-client/src/endpoints/syncV2.pushLoop.ts` формулює його
 * як «одностороннє за задумом: `false` довіряємо, `true` — ні».
 * Не розширюй глушіння на `онлайн + схоже на мережеву помилку`: Wi-Fi
 * без інтернету віддає той самий текст, що й розбитий деплой, і саме
 * там ховається регресія, яку треба бачити.
 */

/**
 * Транспортні помилки `fetch`, за формулюваннями рушіїв. Safari каже
 * `Load failed`, Chrome/Firefox — `Failed to fetch` / `NetworkError`,
 * iOS при обриві з'єднання — `The network connection was lost`.
 *
 * Список НЕ використовується для глушіння сам по собі (див. AI-DANGER
 * вище) — лише як мітка `transport` на події, щоб у Sentry можна було
 * відсікти мережевий шум від решти без здогадок.
 */
const TRANSPORT_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /load failed/i,
  /failed to fetch/i,
  /networkerror/i,
  /network connection was lost/i,
  /network request failed/i,
  /the request timed out/i,
  /cancelled/i,
];

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybe = error as { message?: unknown };
    if (typeof maybe.message === "string") return maybe.message;
  }
  return "";
}

function nameOf(error: unknown): string {
  if (error && typeof error === "object") {
    const maybe = error as { name?: unknown };
    if (typeof maybe.name === "string" && maybe.name.length > 0) {
      return maybe.name;
    }
  }
  return typeof error;
}

export function isTransportError(error: unknown): boolean {
  const message = messageOf(error);
  if (message.length === 0) return false;
  return TRANSPORT_ERROR_PATTERNS.some((re) => re.test(message));
}

export interface TickErrorVerdict {
  /** `false` → подія не їде в Sentry, лишається лише breadcrumb. */
  readonly report: boolean;
  /** Контекст події. Порожній, коли `report === false`. */
  readonly context: Record<string, unknown>;
}

/**
 * @param error Те, що прилетіло в `catch` тіка.
 * @param scope `sync-v2-push-tick` | `sync-v2-pull-tick`.
 * @param online Стан мережі на момент збою. `undefined` — коли
 *   `navigator` недоступний (SSR, тести): тоді нічого не глушимо.
 */
export function classifyTickError(
  error: unknown,
  scope: string,
  online: boolean | undefined,
): TickErrorVerdict {
  const transport = isTransportError(error);

  // Єдина умова глушіння: браузер упевнений, що мережі немає.
  if (transport && online === false) {
    return { report: false, context: {} };
  }

  return {
    report: true,
    context: {
      scope,
      // Ці три поля й розділяють «мережа» від «стейл-асет» у Sentry.
      transport,
      online: online ?? "unknown",
      errorName: nameOf(error),
    },
  };
}

/** `navigator.onLine`, або `undefined` поза браузером. */
export function readOnlineStatus(): boolean | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = (navigator as { onLine?: unknown }).onLine;
  return typeof value === "boolean" ? value : undefined;
}
