import apn from "@parse/node-apn";
import { logger } from "../obs/logger.js";

/**
 * Lazy APNs провайдер на основі JWT-ключа .p8.
 *
 * Інстансується при першому `getApnsProvider()`; якщо обовʼязкові env-и
 * відсутні або невалідні — повертаємо `null`, caller (див. `send.ts`) дивиться
 * на це як на «push sender disabled» і не крашиться. Один warn-лог на boot.
 *
 * Провайдер і конфіг кешуємо у модулі — node-apn тримає http2-сесію до APNs
 * open, і відкривати її заново на кожен send — це і latency, і зайві TLS-
 * handshake-и.
 */

interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

let cachedConfig: ApnsConfig | null | undefined = undefined;
let cachedProvider: apn.Provider | null = null;
let warnedDisabled = false;

/**
 * Normalize `.p8` private-key text from env. APNs TLS вимагає справжні `\n`
 * переноси у PEM-і; env-и часто приходять з `\r\n` (Windows clipboard) або
 * з літеральними двосимвольними escape-ами `\\n`/`\\r\\n` (коли секрет
 * ставлять через shell без quoting-у). Правильна нормалізація:
 *
 *   1. Спочатку перетворюємо літеральні `\\r\\n` / `\\n` → `\n`.
 *   2. Потім схлопуємо native CRLF / CR → LF.
 *   3. Обрізаємо пробіли/переводи навколо і гарантуємо фінальний `\n`.
 *
 * Типова помилка без (1): юзер підставив `APNS_P8_KEY=$(cat key.p8)` у
 * `.env` з одинарними лапками — bash лишив символи `\n` як 2 байти,
 * PEM-parser у node-apn не розпарсить і впаде з `unsupported`.
 *
 * Експортовано окремо, щоб покрити юнітами (див. `send.test.ts`).
 */
export function loadApnsKey(raw: string): string {
  const unescaped = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  const normalized = unescaped.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

function loadConfigFromEnv(): ApnsConfig | null {
  const raw = process.env.APNS_P8_KEY;
  if (!raw || !raw.trim()) {
    if (!warnedDisabled) {
      logger.warn({ msg: "push sender disabled — no APNS_P8_KEY" });
      warnedDisabled = true;
    }
    return null;
  }
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  if (!keyId || !teamId || !bundleId) {
    // Окремий warn — щоб оператор одразу побачив, якого саме env-а бракує;
    // ставити generic "disabled" без деталей → годинник дебагу в проді.
    logger.warn({
      msg: "push sender disabled — APNs config incomplete",
      hasKeyId: Boolean(keyId),
      hasTeamId: Boolean(teamId),
      hasBundleId: Boolean(bundleId),
    });
    warnedDisabled = true;
    return null;
  }
  const key = loadApnsKey(raw);
  if (!key) {
    logger.warn({
      msg: "push sender disabled — APNS_P8_KEY empty after normalization",
    });
    warnedDisabled = true;
    return null;
  }
  return {
    key,
    keyId,
    teamId,
    bundleId,
    production: process.env.APNS_PRODUCTION === "true",
  };
}

function getApnsConfig(): ApnsConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  cachedConfig = loadConfigFromEnv();
  return cachedConfig;
}

/**
 * Return a cached APNs `Provider`, or `null` if disabled.
 *
 * Перший виклик у процесі створює новий `apn.Provider` — це відкриває
 * http2-сесію до APNs; подальші виклики повертають той самий інстанс.
 */
export function getApnsProvider(): apn.Provider | null {
  if (cachedProvider) return cachedProvider;
  const cfg = getApnsConfig();
  if (!cfg) return null;
  cachedProvider = new apn.Provider({
    token: { key: cfg.key, keyId: cfg.keyId, teamId: cfg.teamId },
    production: cfg.production,
  });
  return cachedProvider;
}

/** APNs topic (bundle id) або `null`, якщо конфіг не валідний. */
export function apnsBundleId(): string | null {
  return getApnsConfig()?.bundleId ?? null;
}
