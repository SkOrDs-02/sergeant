/**
 * Stripe - віддалене скасування підписки за `subscription id` (кінець
 * оплаченого періоду). Листок: його викликають `stripeProvider.cancelSubscription`
 * і заміна старої підписки новою ({@link ./supersede}).
 *
 * Успіх або `throw` (не-2xx). Тіло відповіді не читаємо й не логуємо.
 */
import { env } from "../../env/env.js";

const STRIPE_SUBSCRIPTIONS_URL = "https://api.stripe.com/v1/subscriptions";
const CANCEL_TIMEOUT_MS = 15_000;

/**
 * `cancel_at_period_end=true` - доступ до кінця оплаченого періоду (паритет
 * із LiqPay/Plata cancel-семантикою, ADR-1.11).
 *
 * @returns `false`, коли скасовувати нічим (немає `STRIPE_SECRET_KEY`):
 *   DB-side скасування тоді єдине, що можна зробити, як і раніше.
 */
export async function cancelStripeRemoteSubscription(
  subscriptionId: string,
): Promise<boolean> {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey) return false;
  const response = await fetch(
    `${STRIPE_SUBSCRIPTIONS_URL}/${encodeURIComponent(subscriptionId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ cancel_at_period_end: "true" }),
      signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
    },
  );
  if (!response.ok) {
    throw new Error(`Stripe cancel failed: HTTP ${response.status}`);
  }
  return true;
}
