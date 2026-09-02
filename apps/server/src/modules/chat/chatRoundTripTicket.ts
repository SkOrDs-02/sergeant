import { randomUUID } from "node:crypto";

/**
 * AI-5 рішення 1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`,
 * founder-рішення 2026-09-01) — «хід з дією коштує ОДИН запит».
 *
 * Tool-хід чату — це два HTTP-запити до `/api/chat`: перший пропонує
 * `tool_use`, клієнт виконує інструмент, другий несе `tool_results` +
 * `tool_calls_raw` і повертає синтезовану відповідь. `assertAiQuota`
 * (`aiQuota.ts`) списує квиток на КОЖЕН запит до роута, тож без цього
 * механізму один хід з дією коштував 2 з денних 5 — Free-ліміт фактично
 * давав 2,5 дії, не 5.
 *
 * МЕХАНІКА. Перший запит списує квиток як завжди. Якщо модель повернула
 * `tool_use`, `chat.ts` видає одноразовий opaque-квиток і повертає його
 * клієнту РАЗОМ з `tool_calls` (поле `round_trip_ticket`). Клієнт echo-ить
 * його у другому запиті; `assertAiQuota` бачить валідний квиток → списання
 * пропускається (другий запит того самого ходу безкоштовний), а сам квиток
 * стає одноразово використаним.
 *
 * ЧОМУ НЕ МОЖНА ВІРИТИ КЛІЄНТУ ЗА ПРАПОРЦЕМ. Наївний варіант — «якщо в тілі
 * є tool_results/tool_calls_raw, вважай продовженням і не списуй» —
 * підробляється: будь-хто може надіслати порожні `tool_results`/
 * `tool_calls_raw` разом зі звичайним питанням і отримати безлімітний чат
 * повз квоту. Це той самий клас проблеми, що й A1
 * (`docs/90-work/audits/ai-abuse-2026-08-05.md`) — клієнт контролює форму
 * запиту, тож форма сама по собі не може бути джерелом авторизації списання.
 *
 * Квиток тут — НЕ прапорець від клієнта, а серверний секрет: 128-бітний
 * крипто-випадковий id, виданий лише у відповідь на ЩОЙНО оплачений перший
 * тур ЦЬОГО користувача, прив'язаний до його `userId`, одноразовий
 * (consume видаляє запис) і короткоживучий (`TICKET_TTL_MS`). Підробити
 * його — вгадати випадковий UUID; повторно використати — не вийде, бо
 * успішний `consumeRoundTripTicket` видаляє запис. Без валідного квитка
 * запит завжди списується як звичайний — safe default, той самий шлях, що
 * діяв до цього рішення.
 *
 * Per-instance in-memory — той самий свідомий компроміс, що й
 * `chatResponseCache.ts` і `aiQuotaCircuitBreaker.ts`: найгірший сценарій
 * при multi-instance round-robin — квиток видала інша репліка, і
 * продовження на іншому інстансі його не знайде → списується як звичайний
 * запит (той самий стан, що діяв ДО цього фіксу, не гірше). TTL короткий
 * (секунди-десятки секунд клієнтського виконання tool-викликів), тож Map
 * лишається малою; втрата квитка при рестарті сервера — так само fail-safe
 * (falls back to charging), ніколи fail-open на безлім.
 */

interface TicketRecord {
  userId: string;
  expiresAt: number;
}

/**
 * 2 хвилини — запас понад `CHAT_TOOL_TIMEOUT_MS` (30s, `chat.ts`) на
 * клієнтське виконання tool-викликів (sync-запис, IndexedDB) і мережеву
 * затримку до другого запиту. Довше не потрібно: continuation приходить
 * практично одразу після першої відповіді.
 */
const TICKET_TTL_MS = 120_000;

const store = new Map<string, TicketRecord>();

function pruneExpired(now: number): void {
  for (const [id, rec] of store) {
    if (rec.expiresAt <= now) store.delete(id);
  }
}

/**
 * Видає новий квиток для щойно оплаченого першого туру, який модель
 * продовжила `tool_use`-блоком. Викликається лише з `chat.ts`, лише коли
 * `ledgerUserId` відомий (анонім сюди не доходить — `requireSession()`).
 */
export function issueRoundTripTicket(input: { userId: string }): string {
  const now = Date.now();
  pruneExpired(now);
  const id = randomUUID();
  store.set(id, { userId: input.userId, expiresAt: now + TICKET_TTL_MS });
  return id;
}

/**
 * Одноразова перевірка + споживання. Повертає `true`, лише якщо квиток
 * існує, не прострочений і належить `userId` — у ВСІХ інших випадках
 * (невідомий id, прострочений, чужий) повертає `false`, і caller
 * (`assertAiQuota`) падає назад на звичайне списання (safe default).
 * Успішний виклик видаляє запис — повторне використання того самого
 * квитка вже поверне `false`.
 */
export function consumeRoundTripTicket(input: {
  ticket: string;
  userId: string;
}): boolean {
  const now = Date.now();
  pruneExpired(now);
  const rec = store.get(input.ticket);
  if (!rec) return false;
  if (rec.expiresAt <= now) {
    store.delete(input.ticket);
    return false;
  }
  if (rec.userId !== input.userId) return false; // чужий квиток — не видаляємо
  store.delete(input.ticket); // одноразовий
  return true;
}

/** Test-only: повний ресет між тест-кейсами (module-level Map). */
export function __resetRoundTripTickets(): void {
  store.clear();
}

/** Test-only: розмір сховища (для асертів на TTL-очищення). */
export function __roundTripTicketStoreSize(): number {
  return store.size;
}
