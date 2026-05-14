/**
 * `whois` aggregator for `/openclaw whois <user_id|@username>` (PR-whois).
 *
 * Read-only debug snapshot для founder DM: чи Telegram user у allowlist,
 * чи це founder, скільки invocations за останні 7 днів, last-seen,
 * top-5 tool-call-ів по count, optional mute-state.
 *
 * Allowlist під OpenClaw — single-user (`OPENCLAW_FOUNDER_TG_USER_ID`,
 * див. `tools/openclaw/src/openclaw/security.ts`). Тобто `inAllowlist`
 * collapse-ється у `isFounder`; обидва поля експонуємо щоб залишити
 * місце для майбутнього multi-user-у без breaking-change-у.
 *
 * Telegram resolution — fail-soft: якщо токен відсутній / chat не
 * знайдено / 403/429 від Bot API — повертаємо row без TG-imeni
 * (`telegramError.code`), решта секцій рендеряться нормально.
 *
 * Pure helpers навколо `pg.Pool` (як `mute-state.ts` / `store.ts`):
 * caller приносить pool і optional TelegramBotClient (DI-friendly +
 * тестується без `fetch` mock-у).
 */

import type { Pool } from "pg";

import {
  type TelegramBotClient,
  TelegramApiError,
  TelegramForbiddenError,
  TelegramRateLimitError,
} from "../telegram/index.js";

import { type MuteState, getFounderMute } from "./mute-state.js";

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

/** Top-N tool-call rollup row. */
export interface ToolUsageRow {
  tool: string;
  count: number;
}

/** Structured Telegram failure — fail-soft контракт. */
export interface WhoisTelegramError {
  code: "forbidden" | "rate_limit" | "api_error" | "not_found";
  message: string;
  retryAfter?: number;
}

/**
 * Aggregator output. `tgUserId` обов'язковий (resolved або numeric).
 * `username` / `firstName` / `lastName` — present тільки якщо Bot API
 * resolved-ив user. `inAllowlist` для майбутнього multi-user-у тримаємо
 * окремо від `isFounder`, навіть якщо зараз семантично однакові.
 */
export interface WhoisResult {
  tgUserId: number;
  resolvedFrom: "numeric" | "username";
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  inAllowlist: boolean;
  isFounder: boolean;
  invocations7d: number;
  lastSeenIso: string | null;
  topTools: ToolUsageRow[];
  muteState: MuteState | null;
  telegramError: WhoisTelegramError | null;
}

export interface WhoisInput {
  /**
   * Numeric Telegram user-id. Required коли username-resolution не
   * можливий (no client / forbidden). Може бути `null` коли caller
   * передав тільки username.
   */
  tgUserId?: number | null;
  /** Telegram @username без `@`. Resolution через Bot API getChat. */
  username?: string | null;
  /** Founder TG id для `isFounder` check. */
  founderTgUserId: number;
  /** Better Auth founder-id для join у `openclaw_invocations`. */
  founderUserId: string;
  /** Optional telegram client (DI / тести). */
  telegramClient?: TelegramBotClient | null;
  /** Lookback window для invocations. Default 7. */
  windowDays?: number;
  /** Top-N tool rollup. Default 5. */
  topToolsLimit?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Telegram resolution
// ─────────────────────────────────────────────────────────────────────────

/**
 * Викликає `getChat(chat_id)` для resolution. Bot API приймає або
 * numeric id, або `@username`. Failures (forbidden/rate-limit/api) —
 * мапляться у `WhoisTelegramError`; caller проходить далі з missing
 * username, не падає 5xx.
 */
async function resolveTelegramUser(
  client: TelegramBotClient,
  chatId: string | number,
): Promise<{
  tgUserId: number | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  error: WhoisTelegramError | null;
}> {
  try {
    const chat = await client.getChat(chatId);
    // `getChat` повертає `TelegramChat` shape. Для private user chat-ів
    // `first_name` / `last_name` присутні (Bot API spec); `username`
    // — optional. `id` — numeric Telegram user-id.
    return {
      tgUserId: Number(chat.id),
      username: chat.username ?? null,
      firstName: chat.first_name ?? null,
      lastName: chat.last_name ?? null,
      error: null,
    };
  } catch (err) {
    if (err instanceof TelegramRateLimitError) {
      return {
        tgUserId: null,
        username: null,
        firstName: null,
        lastName: null,
        error: {
          code: "rate_limit",
          message: err.description,
          ...(err.retryAfter !== undefined
            ? { retryAfter: err.retryAfter }
            : {}),
        },
      };
    }
    if (err instanceof TelegramForbiddenError) {
      return {
        tgUserId: null,
        username: null,
        firstName: null,
        lastName: null,
        error: { code: "forbidden", message: err.description },
      };
    }
    if (err instanceof TelegramApiError) {
      const desc = err.description.toLowerCase();
      const code: WhoisTelegramError["code"] = desc.includes("not found")
        ? "not_found"
        : "api_error";
      return {
        tgUserId: null,
        username: null,
        firstName: null,
        lastName: null,
        error: { code, message: err.description },
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      tgUserId: null,
      username: null,
      firstName: null,
      lastName: null,
      error: { code: "api_error", message },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DB rollup
// ─────────────────────────────────────────────────────────────────────────

interface InvocationsRollup {
  invocations7d: number;
  lastSeenIso: string | null;
  topTools: ToolUsageRow[];
}

/**
 * Rollup за `openclaw_invocations` для target tg-user-а у вікні
 * `[NOW() - windowDays, NOW()]`. Count + last-seen — один query;
 * top-tools — окремий `jsonb_array_elements` unnest + group-by.
 */
async function fetchInvocationsRollup(
  pool: Pool,
  input: { tgUserId: number; windowDays: number; topToolsLimit: number },
): Promise<InvocationsRollup> {
  const sinceIso = new Date(
    Date.now() - input.windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const summary = await pool.query<{
    count: string;
    last_seen: Date | null;
  }>(
    `SELECT COUNT(*)::bigint AS count, MAX(invoked_at) AS last_seen
       FROM openclaw_invocations
      WHERE founder_tg_user_id = $1::bigint
        AND invoked_at >= $2::timestamptz`,
    [input.tgUserId, sinceIso],
  );
  const summaryRow = summary.rows[0];
  const invocations7d = summaryRow ? Number(summaryRow.count) : 0;
  const lastSeenIso = summaryRow?.last_seen
    ? summaryRow.last_seen instanceof Date
      ? summaryRow.last_seen.toISOString()
      : String(summaryRow.last_seen)
    : null;

  const tools = await pool.query<{ tool: string; count: string }>(
    `SELECT (call ->> 'tool')::text AS tool, COUNT(*)::bigint AS count
       FROM openclaw_invocations,
            LATERAL jsonb_array_elements(tool_calls) AS call
      WHERE founder_tg_user_id = $1::bigint
        AND invoked_at >= $2::timestamptz
        AND (call ->> 'tool') IS NOT NULL
   GROUP BY (call ->> 'tool')
   ORDER BY count DESC, tool ASC
      LIMIT $3`,
    [input.tgUserId, sinceIso, Math.max(1, Math.min(20, input.topToolsLimit))],
  );

  const topTools = tools.rows.map((r) => ({
    tool: String(r.tool),
    count: Number(r.count),
  }));

  return { invocations7d, lastSeenIso, topTools };
}

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Aggregator. Side-ефекти: optional Bot API getChat (read-only),
 * 2 SELECT-и + 1 SELECT-mute. Жодних writes.
 *
 * Винятки fail-soft: getChat 403/429/api_error → `telegramError`
 * present, решта секцій нормальні. Якщо ані numeric id, ані username
 * не дають resolution — returns row з `tgUserId=0` як sentinel.
 */
export async function lookupWhois(
  pool: Pool,
  input: WhoisInput,
): Promise<WhoisResult> {
  const windowDays = input.windowDays ?? 7;
  const topToolsLimit = input.topToolsLimit ?? 5;

  // 1) Resolve Telegram user (optional).
  let resolvedFrom: "numeric" | "username" = "numeric";
  let tgUserId: number | null = input.tgUserId ?? null;
  let username: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;
  let telegramError: WhoisTelegramError | null = null;

  if (input.telegramClient) {
    if (input.username) {
      const lookup = await resolveTelegramUser(
        input.telegramClient,
        `@${input.username.replace(/^@/, "")}`,
      );
      telegramError = lookup.error;
      if (lookup.tgUserId !== null) {
        tgUserId = lookup.tgUserId;
        resolvedFrom = "username";
        username = lookup.username;
        firstName = lookup.firstName;
        lastName = lookup.lastName;
      }
    } else if (input.tgUserId) {
      const lookup = await resolveTelegramUser(
        input.telegramClient,
        input.tgUserId,
      );
      telegramError = lookup.error;
      username = lookup.username;
      firstName = lookup.firstName;
      lastName = lookup.lastName;
    }
  }

  // 2) Allowlist / founder.
  const effectiveTgUserId = tgUserId ?? 0;
  const isFounder =
    effectiveTgUserId !== 0 && effectiveTgUserId === input.founderTgUserId;
  const inAllowlist = isFounder;

  // 3) Invocations rollup (тільки якщо resolved-ий tgUserId не sentinel).
  let rollup: InvocationsRollup = {
    invocations7d: 0,
    lastSeenIso: null,
    topTools: [],
  };
  if (effectiveTgUserId !== 0) {
    rollup = await fetchInvocationsRollup(pool, {
      tgUserId: effectiveTgUserId,
      windowDays,
      topToolsLimit,
    });
  }

  // 4) Mute-state — тільки якщо це founder (єдиний row у `openclaw_mute_state`).
  const muteState = isFounder
    ? await getFounderMute(pool, { founderUserId: input.founderUserId })
    : null;

  return {
    tgUserId: effectiveTgUserId,
    resolvedFrom,
    username,
    firstName,
    lastName,
    inAllowlist,
    isFounder,
    invocations7d: rollup.invocations7d,
    lastSeenIso: rollup.lastSeenIso,
    topTools: rollup.topTools,
    muteState,
    telegramError,
  };
}
