import { BILLING_PROVIDER_HOSTS, safeExternalHref } from "@sergeant/shared";

// Defense-in-depth open-redirect guard (audit F4,
// docs/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md; sec-29 з
// аудиту 2026-10-01). Backend повертає checkout.url / portal.url (LiqPay /
// Plata / legacy Stripe); додатково валідовуємо схему й host на клієнті —
// щоб контракт-дрифт чи компрометація бекенду не змогли перевести юзера на
// довільний origin у high-trust моменті funnel-у.
//
// AI-CONTEXT: це ЄДИНИЙ вхід для `location.assign` на URL білінгу. Раніше
// гард жив лише в `PricingPage`, а «Керувати підпискою» в налаштуваннях
// (`PlanSection`) ішов на `portal.url` без перевірки — другий вхід у той
// самий портал обходив F4.
export function assertAllowedBillingUrl(raw: string): string {
  // Same-origin manage-URL (LiqPay/Plata не мають зовнішнього Customer
  // Portal → повертають `${app}/settings?billing=manage`) безпечний за
  // визначенням — не проганяємо через host-allow-list зовнішніх checkout-ів.
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.origin === window.location.origin) return parsed.toString();
  } catch {
    // впаде нижче як не-allowlisted
  }
  const safe = safeExternalHref(raw, BILLING_PROVIDER_HOSTS);
  if (!safe) throw new Error("billing url not in allow-list");
  return safe;
}
