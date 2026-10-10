/**
 * LiqPay - транспорт (`data` + `signature`) і віддалене скасування рекурентки
 * за `order_id`.
 *
 * Листок без залежностей від `liqpay.ts`: `unsubscribe` викликають і
 * користувацьке скасування ({@link ./liqpay}), і заміна старої підписки новою
 * ({@link ./supersede}), а `supersede` імпортує `liqpay.ts` (success-гілка
 * callback-а). Окремий файл розриває цикл.
 *
 * Секрети (`LIQPAY_PRIVATE_KEY`) ніколи не логуються (Hard Rule #21).
 */
import crypto from "node:crypto";
import { env } from "../../env/env.js";
import { BillingConfigurationError } from "./provider.js";

export const LIQPAY_CHECKOUT_URL = "https://www.liqpay.ua/api/3/checkout";
export const LIQPAY_REQUEST_URL = "https://www.liqpay.ua/api/request";
export const LIQPAY_API_VERSION = 3;
/** Алгоритм підпису. Доку розбіжна (sha3-256 в описі), робочі приклади — sha1. */
const SIGNATURE_ALGO = "sha1" as const;
/** Верхня межа очікування відповіді LiqPay на `unsubscribe`. */
const UNSUBSCRIBE_TIMEOUT_MS = 15_000;

export interface LiqPayKeys {
  publicKey: string;
  privateKey: string;
}

export function getLiqPayKeys(): LiqPayKeys {
  const publicKey = env.LIQPAY_PUBLIC_KEY;
  const privateKey = env.LIQPAY_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new BillingConfigurationError(
      "LIQPAY_PUBLIC_KEY / LIQPAY_PRIVATE_KEY are not set",
    );
  }
  return { publicKey, privateKey };
}

/**
 * `data` = base64(JSON). Експортовано для тестів.
 */
export function encodeData(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

/**
 * signature = base64(sha1(private_key + data + private_key)). Експортовано
 * для тестів і повторного використання у verify.
 */
export function signData(data: string, privateKey: string): string {
  return crypto
    .createHash(SIGNATURE_ALGO)
    .update(privateKey + data + privateKey, "utf8")
    .digest("base64");
}

/**
 * Відповідь `POST /api/request` — звичайний JSON (на відміну від callback-ів,
 * де він загорнутий у base64 `data`). Нас цікавлять лише `result`/`status` і
 * `err_code`; `err_description` і решту тіла навмисно не читаємо й не логуємо
 * (Hard Rule #21: чужий текст відповіді може нести поля платежу).
 */
interface LiqPayApiResult {
  result?: unknown;
  status?: unknown;
  err_code?: unknown;
}

async function readLiqPayApiResult(
  response: Response,
): Promise<LiqPayApiResult | null> {
  try {
    const parsed: unknown = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as LiqPayApiResult)
      : null;
  } catch {
    return null;
  }
}

function safeToken(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).slice(0, 64)
    : "-";
}

/**
 * `unsubscribe` прийнято лише за явного підтвердження: `result:"ok"` або
 * `status:"unsubscribed"`. Помилка, нерозпізнане тіло й не-JSON — відмова:
 * «не знаю» тут гірше за «ні», бо людині скажуть «скасовано», а списання
 * триватимуть.
 */
function assertUnsubscribeAccepted(body: LiqPayApiResult | null): void {
  const accepted =
    body !== null &&
    body.result !== "error" &&
    body.status !== "error" &&
    body.status !== "failure" &&
    (body.result === "ok" || body.status === "unsubscribed");
  if (accepted) return;
  throw new Error(
    `LiqPay unsubscribe rejected: result=${safeToken(body?.result)} ` +
      `status=${safeToken(body?.status)} err_code=${safeToken(body?.err_code)}`,
  );
}

/**
 * `action:unsubscribe` для одного `order_id`. Успіх або `throw`: не-2xx і
 * бізнес-відмова з HTTP 200 (`result:"error"`) однаково кидають, бо інакше
 * відмову провайдера читали б як успіх, а LiqPay далі списував би гроші.
 */
export async function unsubscribeLiqPayOrder(orderId: string): Promise<void> {
  const { privateKey, publicKey } = getLiqPayKeys();
  const payload = {
    version: LIQPAY_API_VERSION,
    public_key: publicKey,
    action: "unsubscribe",
    order_id: orderId,
  };
  const data = encodeData(payload);
  const signature = signData(data, privateKey);
  const body = new URLSearchParams({ data, signature });
  const response = await fetch(LIQPAY_REQUEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(UNSUBSCRIBE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`LiqPay unsubscribe failed: HTTP ${response.status}`);
  }
  // LiqPay віддає помилки бізнес-рівня з HTTP 200 і `result:"error"` у JSON,
  // тож `response.ok` нічого не доводить.
  assertUnsubscribeAccepted(await readLiqPayApiResult(response));
}
