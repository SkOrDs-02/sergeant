import { createHash } from "node:crypto";
import { env } from "../../env.js";
import { logger } from "../../obs/logger.js";

/**
 * Короткоживучий in-memory response-cache для ПЕРШОГО туру `/api/chat`.
 *
 * НАВІЩО: повторні ідентичні питання ("скільки я витратив цього місяця?"),
 * double-submit-и та retry після network-blip-у щоразу платять повний
 * Anthropic-виклик (Haiku first-turn) + latency. Якщо вхід біт-у-біт той
 * самий — відповідь моделі детермінована, тож її можна віддати з кешу.
 *
 * КОРЕКТНІСТЬ ЗА ПОБУДОВОЮ: ключ — це sha256 від повністю зібраного payload-у
 * першого туру (userId + model + system + messages). `system` уже містить
 * живий фінансовий снапшот + RAG + coach-кореляції, тож БУДЬ-ЯКА зміна даних
 * змінює `system` → інший ключ → cache-miss. Stale-данні віддати неможливо:
 * інвалідація автоматична, без явних bust-ів. Тому кеш безпечний навіть для
 * фінансових питань.
 *
 * ОБМЕЖЕННЯ (свідомі):
 *   - Кешується ЛИШЕ перший (non-streaming) тур. Дорогий Sonnet-synthesis
 *     tool-result-тур НЕ кешується (його вхід несе живі tool_results).
 *   - Per-instance. Multi-instance деплой має незалежні кеші — це ОК для
 *     best-effort короткого TTL (той самий підхід, що й circuit-breaker /
 *     aiQuotaHealth in-memory state).
 *   - Quota НЕ рефандиться на cache-hit: middleware вже списав квоту до
 *     хендлера, а рефанд-хелпер семантично привʼязаний до upstream-failure.
 *     Cache-hit коштує квоту, але не коштує Anthropic$ — консервативно й
 *     безпечно (ніколи не недо-списує).
 *
 * Sliding-cleanup ЛІНИВИЙ (на кожному `set`), без `setInterval` у
 * global-scope — уникаємо test-leak-ів і dual-instance-таймерів (той самий
 * патерн, що в `aiQuotaHealth.ts`).
 */

export interface CachedChatResponse {
  /** HTTP-статус (завжди 200 для кешованих success-відповідей). */
  status: number;
  /** Тіло, яке хендлер віддав через `res.json(...)`. */
  body: unknown;
}

interface CacheEntry {
  response: CachedChatResponse;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

/** Test-only: розмір кешу (для асертів у тестах). */
export function __chatResponseCacheSize(): number {
  return store.size;
}

/** Test-only: повний ресет (тести ізолюють стан між кейсами). */
export function __resetChatResponseCache(): void {
  store.clear();
}

function pruneExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Детермінований ключ від фактичного payload-у першого туру. `system` може
 * бути рядком або масивом cache-блоків — сериалізуємо стабільно. `userId`
 * входить у ключ як додатковий guard проти будь-якого крос-юзерного змішування
 * (навіть якщо `system` двох юзерів випадково збігся).
 */
export function buildChatCacheKey(input: {
  userId: string | undefined;
  model: string;
  system: unknown;
  messages: unknown;
}): string {
  const system =
    typeof input.system === "string"
      ? input.system
      : JSON.stringify(input.system);
  return createHash("sha256")
    .update(input.userId ?? "anon")
    .update("\u0000")
    .update(input.model)
    .update("\u0000")
    .update(system)
    .update("\u0000")
    .update(JSON.stringify(input.messages))
    .digest("hex");
}

/**
 * Повертає кешовану відповідь або `null`. Прострочений запис видаляється
 * ліниво. На hit оновлює recency (re-insert у кінець Map) — insertion-order
 * LRU для eviction. `CHAT_RESPONSE_CACHE_TTL_MS <= 0` → кеш вимкнено.
 */
export function getCachedChatResponse(key: string): CachedChatResponse | null {
  if (env.CHAT_RESPONSE_CACHE_TTL_MS <= 0) return null;
  const entry = store.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt <= now) {
    store.delete(key);
    return null;
  }
  // LRU touch: перемістити у кінець, щоб eviction першим викидав реально
  // найдавніше-використаний запис.
  store.delete(key);
  store.set(key, entry);
  logger.debug({ msg: "chat_response_cache_hit" });
  return entry.response;
}

/**
 * Кладе success-відповідь у кеш. No-op при вимкненому TTL або нульовій
 * ємності. Перед вставкою прунить прострочене і витісняє найстаріші записи,
 * поки не звільниться місце під ліміт.
 */
export function setCachedChatResponse(
  key: string,
  response: CachedChatResponse,
): void {
  const ttl = env.CHAT_RESPONSE_CACHE_TTL_MS;
  const max = env.CHAT_RESPONSE_CACHE_MAX_ENTRIES;
  if (ttl <= 0 || max <= 0) return;
  const now = Date.now();
  pruneExpired(now);
  // Якщо ключ уже є — видаляємо, щоб re-insert поставив його у кінець (свіжий).
  store.delete(key);
  while (store.size >= max) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  store.set(key, { response, expiresAt: now + ttl });
  logger.debug({ msg: "chat_response_cache_store", size: store.size });
}
