/**
 * Plata (monobank) - віддалене скасування рекурентки за `subscriptionId`.
 *
 * Листок без залежностей від `plata.ts`/`plataSync.ts`: його викликають і
 * користувацьке скасування ({@link ./plata}), і заміна старої підписки новою
 * ({@link ./supersede}), а `plataSync` імпортує `supersede`. Якби це жило в
 * `plata.ts`, вийшов би цикл plata -> plataSync -> supersede -> plata.
 *
 * Контракт: **успіх або throw**. Відмову monobank (не-2xx, мережа, таймаут) не
 * ковтаємо - рішення власника 2026-10-10 (аудит data-20): "не знаю" гірше за
 * "ні", бо людині скажуть "скасовано", а списання тривають. Текст відповіді
 * monobank не читаємо й не логуємо (Hard Rule #21): лише HTTP-статус.
 */
import { env } from "../../env/env.js";
import { BillingConfigurationError } from "./provider.js";

export const MONOPAY_BASE = "https://api.monobank.ua/api/merchant";

/** Верхня межа очікування відповіді monobank на скасування. */
const CANCEL_TIMEOUT_MS = 15_000;

export function getPlataToken(): string {
  const token = env.PLATA_TOKEN;
  if (!token) {
    throw new BillingConfigurationError("PLATA_TOKEN is not set");
  }
  return token;
}

async function postMonopay(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${MONOPAY_BASE}/${path}`, {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
  });
}

/**
 * `subscription/edit action=cancel` без `refundAmount` (доступ до кінця
 * періоду, ADR-1.11). На 404/400 - fallback на `subscription/remove`, який
 * працює лише поки за підпискою не було жодної оплати.
 *
 * Прийнято (resolve): 2xx від `edit`, або 2xx від `remove`, або 404 від
 * `remove` (підписки в monobank уже нема - списувати нічого). Усе інше -
 * `throw`, щоб роут віддав 502 PROVIDER_CANCEL_FAILED і людина могла повторити.
 */
export async function cancelPlataRemoteSubscription(
  subscriptionId: string,
): Promise<void> {
  const token = getPlataToken();
  const edit = await postMonopay("subscription/edit", token, {
    subscriptionId,
    action: "cancel",
  });
  if (edit.ok) return;
  if (edit.status !== 404 && edit.status !== 400) {
    throw new Error(`Plata subscription/edit failed: HTTP ${edit.status}`);
  }
  const remove = await postMonopay("subscription/remove", token, {
    subscriptionId,
  });
  if (remove.ok || remove.status === 404) return;
  throw new Error(`Plata subscription/remove failed: HTTP ${remove.status}`);
}
