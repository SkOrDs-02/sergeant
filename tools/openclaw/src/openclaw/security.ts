/**
 * OpenClaw bot security primitives (ADR-0031 §2):
 *   - DM-only enforcement
 *   - Single-user allowlist (`OPENCLAW_FOUNDER_TG_USER_ID`)
 *   - Rate-limit reuse with separate, narrow default
 *
 * Окремий від `console/src/security.ts` файл, бо OpenClaw має різні
 * defaults і single-user (а не multi-user CSV) allowlist. Окремо тримати
 * також зменшує ризик випадково shared-стейту між двома bot-instances.
 */

export interface OpenClawEnv {
  OPENCLAW_FOUNDER_TG_USER_ID?: string;
  OPENCLAW_RATE_LIMIT_PER_MIN?: string;
}

/**
 * Хто founder. Витягається з env. Phase 1 — single value (одна людина —
 * Skords-01). Phase 2 може стати CSV якщо буде co-founder #2.
 */
export function parseFounderTgUserId(
  value: string | undefined,
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Allowlist check. Fail-closed: якщо `OPENCLAW_FOUNDER_TG_USER_ID` не
 * задано — НІКОЛИ не пускає. Це навмисно (ADR-0031 §2): бот не повинен
 * стартувати в дозвільному режимі, навіть у dev-у.
 */
export function isFounderAllowed(
  userId: number | undefined,
  env: OpenClawEnv = process.env,
): boolean {
  if (!userId) return false;
  const founderId = parseFounderTgUserId(env.OPENCLAW_FOUNDER_TG_USER_ID);
  if (!founderId) return false;
  return userId === founderId;
}

/**
 * DM-only check. OpenClaw не реагує на групи / supergroup-и / channel-и;
 * Sergeant Ops supergroup і кожен інший контекст — `Sergeant_alert_bot`-а
 * територія (ADR-0030).
 */
export function isPrivateChat(chatType: string | undefined): boolean {
  return chatType === "private";
}

export function parseOpenClawRateLimitPerMinute(
  value: string | undefined,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.floor(parsed);
}
