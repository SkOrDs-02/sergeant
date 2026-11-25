/**
 * Безпечний зовнішній URL для навігації (`location.assign`, `<a href>`).
 *
 * AI-CONTEXT: URL, які приходять із відповідей сервера чи upstream-у
 * (портал білінгу, `checkoutWebLink` Сільпо), не можна віддавати в
 * навігацію як є: `z.string().url()` пропускає `javascript:`, `data:` і
 * будь-який хост, тож дрейф контракту чи компрометація бекенду давала б
 * open redirect з довірою Sergeant (аудит 2026-10-01, sec-29). Пропускаємо
 * лише абсолютний `https:` без облікових даних у URL і з хостом з
 * allow-list-у; усе інше — `null`, і викликач ховає кнопку або не
 * переходить.
 */

export type HostAllowList =
  ReadonlySet<string> | ((hostname: string) => boolean);

function hostAllowed(hostname: string, allow: HostAllowList): boolean {
  return typeof allow === "function" ? allow(hostname) : allow.has(hostname);
}

export function safeExternalHref(
  raw: unknown,
  allow: HostAllowList,
): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: URL;
  try {
    // Без base: відносний URL тут не валідний, бо зовнішній перехід завжди абсолютний.
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username !== "" || parsed.password !== "") return null;
  // Нестандартний порт на провайдерському хості — не те, що ми відкриваємо.
  if (parsed.port !== "") return null;
  if (!hostAllowed(parsed.hostname.toLowerCase(), allow)) return null;
  return parsed.href;
}

/**
 * Хости провайдерів оплати, куди сервер може відправити на checkout чи
 * портал керування підпискою (LiqPay, Plata by mono, legacy Stripe).
 */
export const BILLING_PROVIDER_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
  // Phase 7 UA billing — LiqPay (ПриватБанк) checkout host.
  "www.liqpay.ua",
  // Plata by mono (monopay) invoice-page hosts.
  "pay.mbnk.biz",
  "pay.monobank.ua",
]);

/** `silpo.ua` і його піддомени. `evilsilpo.ua` і `silpo.ua.evil.com` — ні. */
export function isSilpoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "silpo.ua" || host.endsWith(".silpo.ua");
}

/** Посилання на кошик Сільпо: лише `https:` на хостах Сільпо, інакше `null`. */
export function safeSilpoHref(raw: unknown): string | null {
  return safeExternalHref(raw, isSilpoHost);
}
