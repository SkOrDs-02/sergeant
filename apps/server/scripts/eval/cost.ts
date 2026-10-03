/**
 * Вартість прогону — двома числами: без кешу і з кешем.
 *
 * AI-CONTEXT (спека `ai-eval-harness-v2.md` § Вартість). Стенд раніше рахував
 * ціну як «токени × прайс» і для чату помилявся вчетверо: перший тур несе
 * ~10 583 вхідних токени (77 схем інструментів + `SYSTEM_PREFIX`), прод кешує
 * цей префікс, і реальна вартість залежить від ДОВЖИНИ СЕСІЇ, а не від
 * прайсу за токен.
 *
 * Формула кешу взята з `src/modules/chat/promptCache.ts` (розділ **TTL**), а
 * не вигадана тут: стабільний префікс кешується з `ttl: "1h"`, запис коштує
 * 2× ціни input, читання — 0.1×. За N повідомлень у межах години сумарний
 * множник на префікс = `2 + 0.1·(N−1)`. Для 5-хвилинного TTL було б ≈1.25·N
 * (майже кожен тур холодний); рівність настає при N≈1.65.
 *
 * AI-DANGER: колонка «з кешем» — це ПРОЄКЦІЯ, а не вимір. Стенд ходить через
 * `invokeLLM`, який шле `system` простим рядком без `cache_control`, тож
 * жодного реального cache-hit тут не буде. Реальність перевіряється полем
 * `cache_read_input_tokens` у відповіді (див. `RunResult.cacheReadTokens` і
 * § «Кеш» у звіті). Якщо в живому прогоні воно всюди 0 — це очікувано для
 * стенду, але означає, що переносити цифру на прод можна лише для тих шляхів,
 * де прод справді ставить breakpoint (сьогодні — тільки chat).
 */

/** Довжини сесії для таблиці вартості. */
export const SESSION_LENGTHS = [1, 3, 5, 10, 20] as const;

/** Множник запису кешу з TTL=1h (Anthropic). */
const CACHE_WRITE_MULTIPLIER = 2;
/** Множник читання з кешу. */
const CACHE_READ_MULTIPLIER = 0.1;

export interface TokenPrice {
  /** USD за 1M вхідних токенів. */
  input: number;
  /** USD за 1M вихідних токенів. */
  output: number;
}

/** Сумарний множник на кешований префікс за N повідомлень у межах TTL. */
export function cachedPrefixMultiplier(messages: number): number {
  const n = Math.max(1, messages);
  return CACHE_WRITE_MULTIPLIER + CACHE_READ_MULTIPLIER * (n - 1);
}

export interface SessionCostInput {
  /** Стабільний префікс (system + tools), однаковий на кожному турі. */
  prefixTokens: number;
  /** Змінна частина входу на один тур (репліка користувача, tool-output). */
  freshTokens: number;
  outputTokens: number;
  price: TokenPrice;
  messages: number;
}

/** Вартість сесії БЕЗ кешу: кожен тур платить за весь вхід повністю. */
export function sessionCostNoCache(input: SessionCostInput): number {
  const { prefixTokens, freshTokens, outputTokens, price, messages } = input;
  const inputTokens = messages * (prefixTokens + freshTokens);
  return (
    (inputTokens * price.input + messages * outputTokens * price.output) / 1e6
  );
}

/** Вартість сесії З кешем: префікс за формулою `2 + 0.1·(N−1)`. */
export function sessionCostWithCache(input: SessionCostInput): number {
  const { prefixTokens, freshTokens, outputTokens, price, messages } = input;
  const inputTokens =
    cachedPrefixMultiplier(messages) * prefixTokens + messages * freshTokens;
  return (
    (inputTokens * price.input + messages * outputTokens * price.output) / 1e6
  );
}

/**
 * Скільки з виміряного входу припадає на стабільний префікс.
 *
 * Точного токенайзера в стенді немає, тож ділимо пропорційно ДОВЖИНІ В
 * СИМВОЛАХ system і user. Для української це приблизно, але помилка тут
 * другого порядку: рішення ухвалюється за різницею між N=1 і N=20, а вона
 * визначається множником кешу, не точністю поділу.
 */
export function splitPrefixTokens(
  totalInputTokens: number,
  systemText: string,
  userText: string,
): { prefixTokens: number; freshTokens: number } {
  const total = systemText.length + userText.length;
  if (total === 0) return { prefixTokens: 0, freshTokens: totalInputTokens };
  const prefixTokens = Math.round(
    (totalInputTokens * systemText.length) / total,
  );
  return { prefixTokens, freshTokens: totalInputTokens - prefixTokens };
}

// ── Живі ціни ───────────────────────────────────────────────────────

/**
 * Фолбек-таблиця: USD / 1M токенів. Потрібна лише для не-OpenRouter id
 * (прямі Anthropic-імена) і для offline/dry-run. Статична таблиця
 * систематично протухала — тому основне джерело нижче живе.
 */
const PRICE_PER_1M: Record<string, TokenPrice> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const livePrices = new Map<string, TokenPrice>();

/** Метадані каталогу — потрібні зоровому стенду для фільтра модальностей. */
export interface CatalogEntry {
  id: string;
  price: TokenPrice | null;
  inputModalities: string[];
}

const catalog = new Map<string, CatalogEntry>();

/**
 * Тягне каталог OpenRouter на старті прогону. Публічний, ключа не потребує,
 * коштує один GET. Мовчазний фолбек на статичну таблицю, якщо мережі немає.
 */
export async function loadCatalog(): Promise<void> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) return;
    const body = (await response.json()) as {
      data?: Array<{
        id?: string;
        pricing?: { prompt?: string; completion?: string };
        architecture?: { input_modalities?: string[] };
      }>;
    };
    for (const model of body.data ?? []) {
      if (!model.id) continue;
      const input = Number(model.pricing?.prompt) * 1e6;
      const output = Number(model.pricing?.completion) * 1e6;
      const price =
        Number.isFinite(input) && Number.isFinite(output) && input > 0
          ? { input, output }
          : null;
      if (price) livePrices.set(model.id, price);
      catalog.set(model.id, {
        id: model.id,
        price,
        inputModalities: model.architecture?.input_modalities ?? [],
      });
    }
  } catch {
    /* каталог недоступний — лишаємось на статичній таблиці */
  }
}

export function catalogEntry(model: string): CatalogEntry | undefined {
  return catalog.get(model);
}

export function priceFor(model: string): TokenPrice | null {
  return livePrices.get(model) ?? PRICE_PER_1M[model] ?? null;
}

export function estimateCost(
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null {
  const price = priceFor(model);
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1e6;
}
