/**
 * Status: Active
 *
 * Серверна перевірка згоди на аналітику (`user_preferences.analytics`) для
 * подій, які сервер шле в PostHog від імені користувача (`posthogAi.ts`:
 * `$ai_generation` / `$ai_span`). Аудит 2026-10-01, `priv-09`: до цього такі
 * події йшли з `distinctId = userId` для всіх, хоча клієнтський PostHog
 * гейтиться «Дозволити» (політика: «аналітика вмикається лише після
 * відповіді "Дозволити"»), і людина, що відмовилась, мала профіль
 * використання AI у третьої сторони.
 *
 * Fail-closed: відсутній рядок, `false`, `null` і збій БД = «згоди немає».
 * Дефолт колонки `analytics` — `false` (міграція 111, `dataRights.ts`).
 *
 * Кеш у памʼяті процесу, щоб не робити запит до БД на кожен LLM-виклик: на
 * користувача один SELECT на `TTL`, паралельні промахи зливаються в один
 * запит. `invalidateAnalyticsConsent` викликає `routes/me.ts` після зміни
 * налаштувань, тож відкликання діє одразу, а не через TTL (на іншій репліці —
 * не пізніше за TTL).
 */

import { pool } from "../db.js";
import { logger } from "../obs/logger.js";

/** Скільки живе закешоване значення. */
export const ANALYTICS_CONSENT_TTL_MS = 5 * 60_000;
/** Стеля кешу: перевищення витісняє найстаріші записи. */
const MAX_CACHE_ENTRIES = 10_000;

interface Entry {
  granted: boolean;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<boolean>>();
// Інвалідація під час польоту запиту не має воскресити застаріле значення:
// запит, що стартував до неї, свій результат у кеш не кладе.
let epoch = 0;

/**
 * Синхронна відповідь з кешу: `true`/`false` або `undefined`, коли значення
 * невідоме чи протухло (тоді caller мусить викликати `resolveAnalyticsConsent`).
 */
export function peekAnalyticsConsent(userId: string): boolean | undefined {
  const hit = cache.get(userId);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(userId);
    return undefined;
  }
  return hit.granted;
}

function remember(userId: string, granted: boolean): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(userId, {
    granted,
    expiresAt: Date.now() + ANALYTICS_CONSENT_TTL_MS,
  });
}

/**
 * Згода з кешу або з БД. Не кидає: збій БД = `false` і НЕ кешується
 * (наступний виклик спробує знову).
 */
export function resolveAnalyticsConsent(userId: string): Promise<boolean> {
  const cached = peekAnalyticsConsent(userId);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = inflight.get(userId);
  if (pending) return pending;
  const startedAtEpoch = epoch;
  const lookup = (async () => {
    try {
      const result = await pool.query<{ analytics: boolean | null }>(
        `SELECT analytics
           FROM user_preferences
          WHERE user_id = $1`,
        [userId],
      );
      const granted = result.rows[0]?.analytics === true;
      if (startedAtEpoch === epoch) remember(userId, granted);
      return granted;
    } catch (err) {
      logger.warn({
        msg: "analytics_consent_check_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return false;
    } finally {
      inflight.delete(userId);
    }
  })();
  inflight.set(userId, lookup);
  return lookup;
}

/** Скинути кеш користувача після зміни його налаштувань. */
export function invalidateAnalyticsConsent(userId: string): void {
  epoch += 1;
  cache.delete(userId);
}

/** Тільки для тестів. */
export function resetAnalyticsConsentForTests(): void {
  cache.clear();
  inflight.clear();
  epoch = 0;
}
