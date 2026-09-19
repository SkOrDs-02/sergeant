/**
 * Best-effort latency для `$ai_span` tool-спанів (ініціатива 0025, Фаза 2,
 * `docs/work/specs/initiatives/0025-posthog-ai-observability.md`).
 *
 * Сервер НЕ виконує chat-tool-и (клас HubChat: tool def на сервері,
 * виконання — на клієнті, `.agents/skills/sergeant-module-ai/SKILL.md`).
 * Єдина latency, яку сервер взагалі МОЖЕ виміряти, — час МІЖ видачею
 * tool_use-пропозиції (кінець першого HTTP-запиту `/api/chat`) і
 * надходженням `tool_results` (початок другого). Це latency ВСЬОГО
 * round-trip-у (мережа туди-назад + клієнтське виконання ВСІХ
 * запропонованих tool-ів разом), НЕ окремого tool-виклику — per-tool
 * гранулярність вимагала б розширення клієнтського контракту
 * (`ToolResult`-схеми полем timing), що поза межами Фази 2 (§ Контракт
 * даних: `$ai_input_state`/`$ai_output_state` лишаються порожніми, доки
 * власник не затвердить санітизований піднабір).
 *
 * НЕЗАЛЕЖНИЙ від `chatRoundTripTicket.ts` навмисно. Той запис одноразово
 * споживає й ВИДАЛЯЄ мідлвар `assertAiQuota` (`aiQuota.ts`) ДО того, як
 * хендлер `chat.ts` отримує керування — тобто на момент побудови спанів
 * там уже нічого немає. Ключ тут — те саме ЗНАЧЕННЯ `round_trip_ticket`
 * (echo від клієнта, не секрет ДЛЯ НАС повторно — ми самі його видали як
 * `$ai_trace_id`), той самий TTL, що й security-квиток. Fail-safe:
 * відсутній/протермінований запис → спан без `$ai_latency` (undefined),
 * не помилка.
 *
 * Per-instance in-memory — той самий свідомий компроміс, що й
 * `chatRoundTripTicket.ts`/`chatResponseCache.ts`/`aiQuotaCircuitBreaker.ts`:
 * найгірший сценарій при multi-instance round-robin — запис лишився на
 * іншій репліці, тож спан просто не отримає latency (не гірше, ніж без
 * цього модуля взагалі).
 */

interface TimingRecord {
  issuedAt: number;
  expiresAt: number;
}

/** Дзеркалить `TICKET_TTL_MS` з `chatRoundTripTicket.ts`. */
const TIMING_TTL_MS = 120_000;

const store = new Map<string, TimingRecord>();

function pruneExpired(now: number): void {
  for (const [id, rec] of store) {
    if (rec.expiresAt <= now) store.delete(id);
  }
}

/**
 * Викликається, коли перший тур видає tool_use-пропозицію і `chat.ts`
 * видає round-trip-квиток клієнту (`attachRoundTripTicket`). `traceId` —
 * те саме значення, що йде клієнту як `round_trip_ticket`.
 */
export function markToolTurnIssued(traceId: string): void {
  const now = Date.now();
  pruneExpired(now);
  store.set(traceId, { issuedAt: now, expiresAt: now + TIMING_TTL_MS });
}

/**
 * Одноразове читання: повертає latency в мс і видаляє запис (той самий
 * round-trip не повинен впливати на латентність наступного). `undefined` —
 * запису немає (протух, інший інстанс, старий клієнт без квитка) — caller
 * шле спан без `$ai_latency`, не помилку.
 */
export function takeToolTurnLatencyMs(traceId: string): number | undefined {
  const now = Date.now();
  pruneExpired(now);
  const rec = store.get(traceId);
  if (!rec) return undefined;
  store.delete(traceId);
  return now - rec.issuedAt;
}

/** Test-only: повний ресет між тест-кейсами (module-level Map). */
export function __resetChatToolSpanTimingForTests(): void {
  store.clear();
}

/** Test-only: розмір сховища (для асертів на TTL-очищення). */
export function __chatToolSpanTimingStoreSize(): number {
  return store.size;
}
