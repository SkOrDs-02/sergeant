import { createHash } from "node:crypto";

/** Допоміжне для `mcpClient.ts` (кеш сесії, стеля тіла, `Retry-After`); окремо через max-lines 600. */

/**
 * Стеля тіла відповіді MCP (rel-22). Найбільша легітимна відповідь - список
 * чеків (`orders[]` з позиціями); 4 МіБ із запасом покриває її, а зламаний чи
 * зловмисний апстрім не може змусити сервер буферизувати необмежений текст.
 */
export const SILPO_MCP_MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Кеш initialize-сесії (rel-22). Без нього кожен `callMcpTool` платив двома
 * зайвими HTTP-запитами (initialize + notifications/initialized), а typeahead
 * робив їх 3-5 разів на натискання. Ключ - SHA-256 access-токена: токен
 * належить одному користувачеві, а після refresh ключ змінюється сам, тож
 * сесія одного користувача не може дістатись іншому. TTL короткий, бо сервер
 * Сільпо stateless per-call (спайк §0) і сесія мало що несе.
 */
const SESSION_CACHE_TTL_MS = 5 * 60_000;
const SESSION_CACHE_MAX = 500;
export const sessionCache = new Map<
  string,
  { sessionId: string | null; expiresAt: number }
>();

export function sessionKey(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("hex");
}
export function sessionCacheGet(
  key: string,
): { sessionId: string | null } | null {
  const hit = sessionCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    sessionCache.delete(key);
    return null;
  }
  return { sessionId: hit.sessionId };
}
export function sessionCacheSet(key: string, sessionId: string | null): void {
  if (sessionCache.size >= SESSION_CACHE_MAX) {
    const oldest = sessionCache.keys().next().value;
    if (oldest !== undefined) sessionCache.delete(oldest);
  }
  sessionCache.set(key, {
    sessionId,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("Silpo MCP response body exceeds the size cap");
    this.name = "BodyTooLargeError";
  }
}

/** `Retry-After`: секунди або HTTP-дата (RFC 9110 §10.2.3). */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

/** Читає тіло з жорсткою стелею за байтами; не буферизує більше `max`. */
export async function readBodyCapped(
  response: Response,
  max: number,
): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
