import { randomUUID } from "node:crypto";
import type { Request } from "express";

/**
 * AI-5 рішення 1 (`docs/work/specs/audits/2026-09-01-product-audit/findings.md`,
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
 * ЗВУЖЕННЯ (sec-03, аудит 2026-10-01). `assertAiQuota` погашає квиток лише на
 * `/api/chat` (`requireAiQuota("ai", { allowRoundTripTicket: true })`) і лише
 * на запиті з непорожніми `tool_results` + `tool_calls_raw`. Першому турові
 * квиток нічого не дає, тож відповідь першого туру з новим квитком не можна
 * «прокрутити» в безкоштовний наступний перший тур.
 *
 * ЧОМУ НЕ МОЖНА ВІРИТИ КЛІЄНТУ ЗА ПРАПОРЦЕМ. Наївний варіант — «якщо в тілі
 * є tool_results/tool_calls_raw, вважай продовженням і не списуй» —
 * підробляється: будь-хто може надіслати порожні `tool_results`/
 * `tool_calls_raw` разом зі звичайним питанням і отримати безлімітний чат
 * повз квоту. Це той самий клас проблеми, що й A1
 * (`docs/work/specs/audits/ai-abuse-2026-08-05.md`) — клієнт контролює форму
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

/**
 * Раунд інструментів, після якого видано квиток (С-2 (б), спека
 * `docs/work/specs/hubchat-second-tool-round.md`). `1` — квиток першого ходу:
 * запит, оплачений ним, може отримати другий раунд. `2` — квиток другого
 * раунду: запит, оплачений ним, іде лише в синтез і нових квитків не видає.
 * Так хід «знайди й зміни» коштує одну одиницю (AI-5), а підроблений «пошук»
 * не крутить безкоштовні виклики моделі по колу.
 */
export type RoundTripRound = 1 | 2;

/** Позначка на `req`, яку ставить `assertAiQuota`, коли погасив квиток. */
export type WithRoundTripRound = { aiRoundTripRound?: RoundTripRound };

interface TicketRecord {
  userId: string;
  expiresAt: number;
  round: RoundTripRound;
}

/**
 * 2 хвилини — запас понад `CHAT_TOTAL_TIMEOUT_MS` (30s, `chat.ts`) на
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
 *
 * `input.id` (ініціатива 0025, Фаза 2) — опційний caller-supplied id
 * замість власного `randomUUID()`. `chat.ts` передає сюди той самий
 * `$ai_trace_id`, який уже пішов у PostHog для генерації першого туру —
 * так квиток, що клієнт echo-ить назад у другому запиті, одночасно є
 * стабільним trace id для tool-спанів і синтезної генерації (§ План змін,
 * Фаза 2). Ентропія та сама (`randomUUID()`), лише точка виклику
 * переїхала на один кадр вище — security-властивості квитка (одноразовий,
 * прив'язаний до `userId`, короткоживучий) не змінюються.
 */
export function issueRoundTripTicket(input: {
  userId: string;
  id?: string | undefined;
  /** Раунд, після якого видано квиток; без поля — перший хід. */
  round?: RoundTripRound;
}): string {
  const now = Date.now();
  pruneExpired(now);
  const id = input.id || randomUUID();
  store.set(id, {
    userId: input.userId,
    expiresAt: now + TICKET_TTL_MS,
    round: input.round ?? 1,
  });
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
  return redeemRoundTripTicket(input) !== null;
}

/**
 * Те саме споживання, що `consumeRoundTripTicket`, але повертає раунд
 * погашеного квитка (`null` — не погашено). Потрібне `assertAiQuota`, щоб
 * обробник знав, чи має запит право на другий раунд.
 */
export function redeemRoundTripTicket(input: {
  ticket: string;
  userId: string;
}): RoundTripRound | null {
  const now = Date.now();
  pruneExpired(now);
  const rec = store.get(input.ticket);
  if (!rec) return null;
  if (rec.expiresAt <= now) {
    store.delete(input.ticket);
    return null;
  }
  if (rec.userId !== input.userId) return null; // чужий квиток — не видаляємо
  store.delete(input.ticket); // одноразовий
  return rec.round;
}

/**
 * Винесено з `aiQuota.ts` (2026-11-19, С-2 (б)): там лише виклик, тут уся
 * механіка квитка.
 *
 * Читає `round_trip_ticket` із сирого `req.body` (цей middleware стоїть ДО
 * `parseBody(ChatRequestSchema, …)` у `chat.ts`, той самий патерн, що
 * `resolvePresetBudget` уже використовує для `preset`) і намагається його
 * спожити для `userId`. `req.body` тут може бути `undefined` узагалі —
 * `requireAiQuota()` монтується і на роутах без tool-round-trip (`coach.ts`,
 * `nutrition.ts`), де поля просто нема.
 *
 * Увага (sec-03 / logic-02, аудит 2026-10-01): квиток погашається ЛИШЕ на
 * запиті форми «непорожні `tool_results` І `tool_calls_raw`». Без цього він
 * знімав списання з будь-якого запиту, а перший тур видає новий квиток на
 * кожну відповідь із `tool_calls`: виходив безкінечний ланцюжок безкоштовних
 * ходів повз тижневу квоту Free. Форма сама НЕ авторизація (її підробляє
 * клієнт, див. `chatRoundTripTicket.ts`): авторизує серверний квиток, а
 * форма лише звужує, де його можна витратити. Запит, оплачений квитком,
 * завжди йде гілкою синтезу `chat.ts`; новий квиток вона видає лише разом із
 * другим раундом інструментів і з позначкою «раунд 2» (С-2 (б)), а запит,
 * оплачений квитком другого раунду, ні раунду, ні квитка вже не отримує. Квиток,
 * що не пройшов умову форми, НЕ споживається, а запит списується як звичайний.
 */
export function tryConsumeRoundTripTicket(
  req: Request,
  userId: string,
): boolean {
  const body = req.body as
    | {
        round_trip_ticket?: unknown;
        tool_results?: unknown;
        tool_calls_raw?: unknown;
      }
    | undefined;
  const raw = body?.round_trip_ticket;
  if (typeof raw !== "string" || raw.length === 0) return false;
  const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0;
  if (!nonEmpty(body?.tool_results) || !nonEmpty(body?.tool_calls_raw)) {
    return false;
  }
  const round = redeemRoundTripTicket({ ticket: raw, userId });
  if (round === null) return false;
  // С-2 (б): запит, оплачений квитком другого раунду, третього раунду не
  // отримує (`chatSecondRound.ts`).
  (req as Request & WithRoundTripRound).aiRoundTripRound = round;
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
