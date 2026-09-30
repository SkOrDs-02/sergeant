import type { KeyRing } from "./keyRing.js";
import { parseKeyRing } from "./keyRing.js";
import { env } from "../env/env.js";
import { logger } from "../obs/logger.js";
import {
  decryptString,
  encryptString,
  isEncrypted,
} from "../auth/tokenCrypto.js";

/**
 * At-rest шифрування вільного тексту про здоровʼя (GDPR Art.9) —
 * `docs/work/specs/health-text-encryption.md`. Зараз охоплює лише
 * `fizruk_injuries.note` (рішення власника 2026-09-29).
 *
 * AI-CONTEXT: механізм не новий — це `encryptString`/`decryptString` з
 * `auth/tokenCrypto.ts` (AES-256-GCM, формат у-колонці
 * `enc:v2:k<ver>:<iv>:<tag>:<ct>`). Самоописний префікс означає: міграція
 * схеми НЕ потрібна (колонка `note` вже TEXT), а старі plaintext-рядки
 * читаються як є і перешифровуються ліниво при наступному записі.
 * Кільце ключів — те саме, що для Better Auth токенів
 * (`BETTER_AUTH_TOKEN_ENC_KEY[S]`, обовʼязкове в проді), тож нового env
 * не потрібно, а ротація працює через `*_KEYS` + `*_CURRENT_VERSION`.
 *
 * Без ключа (dev/тести) запис лишається plaintext — так само, як
 * `createEncryptingAdapter` не вмикається без кільця.
 *
 * Fail-soft: помилка розшифрування дає порожній рядок + лог (без
 * значення, Hard Rule #21), а не 500 на весь sync/експорт.
 */

let cachedRing: KeyRing | null | undefined;

export function healthTextKeyRing(): KeyRing | null {
  if (cachedRing === undefined) {
    cachedRing = parseKeyRing({
      keysCsv: env.BETTER_AUTH_TOKEN_ENC_KEYS,
      currentVersion: env.BETTER_AUTH_TOKEN_ENC_KEY_CURRENT_VERSION,
      legacyKey: env.BETTER_AUTH_TOKEN_ENC_KEY,
      envName: "BETTER_AUTH_TOKEN_ENC_KEY",
    });
  }
  return cachedRing;
}

/** Шифрує непорожній текст; порожній/без ключа повертає як є. */
export function encryptHealthText(
  plaintext: string,
  ring: KeyRing | null = healthTextKeyRing(),
): string {
  if (plaintext === "" || !ring) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  return encryptString(plaintext, ring);
}

/**
 * Розшифровує значення з БД/op-log. Plaintext (legacy) повертається без
 * змін; збій розшифрування -> "" + warn.
 */
export function decryptHealthText(
  value: string,
  ring: KeyRing | null = healthTextKeyRing(),
): string {
  if (!isEncrypted(value)) return value;
  if (!ring) {
    logger.warn({ msg: "health_text_decrypt_no_key" });
    return "";
  }
  try {
    return decryptString(value, ring);
  } catch (err) {
    logger.warn({
      msg: "health_text_decrypt_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

/**
 * Копія `row` sync-опа з зашифрованим `note`, лише для `fizruk_injuries`.
 * Для op-log payload: без цього plaintext лежав би в `sync_op_log.row`.
 */
export function encryptOpRowForStorage(
  table: string,
  row: Record<string, unknown>,
  ring?: KeyRing | null,
): Record<string, unknown> {
  if (table !== "fizruk_injuries" || typeof row["note"] !== "string") {
    return row;
  }
  return { ...row, note: encryptHealthText(row["note"], ring) };
}

/** Зворотне до {@link encryptOpRowForStorage} — для pull/stream. */
export function decryptOpRowForPull<T>(
  table: string,
  row: T,
  ring?: KeyRing | null,
): T {
  if (table !== "fizruk_injuries" || !row || typeof row !== "object") {
    return row;
  }
  const rec = row as Record<string, unknown>;
  const note = rec["note"];
  if (typeof note !== "string" || !isEncrypted(note)) return row;
  return { ...rec, note: decryptHealthText(note, ring) } as T;
}
