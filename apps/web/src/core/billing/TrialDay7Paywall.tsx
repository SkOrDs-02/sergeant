import { useEffect, useState } from "react";
import { usePlan } from "./usePlan";
import {
  PaywallModal,
  type PaywallModalProps,
  type PaywallVariant,
} from "./PaywallModal";
import { useTrialDay7Variant } from "./featureFlags";
import { paywallTrialDay7Copy } from "@shared/i18n";
import { safeReadStringSS, safeWriteSS } from "@shared/lib/storage/storage";

/**
 * Reverse-trial day-7 paywall (growth-experiment G_next-1, CMP-70 /
 * Eng-wiring CMP-72).
 *
 * Автоматично монтований у `HubMainContent` (поза FTUX-сесією). Відкриває
 * `<PaywallModal surface="trial_day7">` коли on-file підписка
 * `status === "trialling"` і до `currentPeriodEnd` лишилось ≤ 24 год —
 * момент перед автоматичним downgrade (ADR-0068: paywall = попередження
 * перед downgrade, не opt-in CTA). Сам surface спрацьовує ОДИН раз на
 * trial — dismiss падає у `sessionStorage` (tab-scoped), keyed by
 * `currentPeriodEnd`, тож новий trial через перепідписку показується
 * знову, а tab-перезавантаження того ж trial — ні.
 *
 * A/B-варіант — sticky per user через `useTrialDay7Variant()` (FNV-1a
 * hash `user.id`). `paywall_viewed` несе `{ surface:"trial_day7",
 * variant:"A"|"B" }` — PostHog funnel
 * `paywall_viewed → checkout_opened → subscription_started` зводиться
 * per variant downstream (Рупор / CMO, PostHog UI — окремий крок, не цей PR).
 *
 * A/B-копі живе в `apps/web/src/shared/i18n/uk.ts` (`paywallTrialDay7Copy`)
 * — Hard Rule i18n: жодного кириличного JSX-літералу, єдина точка правди.
 *
 * CTA веде на `/pricing?source=paywall` (загальний PaywallModal-контракт) —
 * attribution source-query === `paywall` (не `paywall_trial_day7`), бо
 * variant-атрибутія вже живе в `paywall_viewed.variant`. Початковий plan
 * CMP-70 §2 пропонував `?source=paywall_trial_day7`, але це форкнуло б
 * checkout-handler; поточний `PricingPage.tsx` читає `source=paywall` —
 * лишаємо як є, variant зчитується з funnel-ів, не з query.
 */

const DISMISS_KEY_PREFIX = "trial_day7_paywall_dismissed_v1";
const HOURS_24_MS = 24 * 60 * 60 * 1000;

export interface TrialDay7PaywallProps {
  /** Override "now" for tests. Defaults to `Date.now`. */
  now?: () => number;
}

function dismissKey(periodEnd: string): string {
  return `${DISMISS_KEY_PREFIX}:${periodEnd}`;
}

function remainingMs(periodEnd: string, now: number): number | null {
  const end = Date.parse(periodEnd);
  if (Number.isNaN(end)) return null;
  return end - now;
}

export function TrialDay7Paywall({
  now = Date.now,
}: TrialDay7PaywallProps = {}) {
  const { subscription } = usePlan();
  const variant: PaywallVariant = useTrialDay7Variant();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const status = subscription?.status;
    const periodEnd = subscription?.currentPeriodEnd;
    if (!status || !periodEnd) {
      setOpen(false);
      return;
    }
    if (status !== "trialling") {
      setOpen(false);
      return;
    }
    const left = remainingMs(periodEnd, now());
    if (left === null) {
      setOpen(false);
      return;
    }
    // 0 ≤ remaining ≤ 24h — момент «перед downgrade». Негативний remaining
    // (clock skew / race з webhook) — не показуємо, наступний status-fetch
    // перекладе `status` у не-trialling.
    if (left < 0 || left > HOURS_24_MS) {
      setOpen(false);
      return;
    }
    if (safeReadStringSS(dismissKey(periodEnd)) === "1") {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [subscription?.status, subscription?.currentPeriodEnd, now]);

  function handleClose() {
    setOpen(false);
    const periodEnd = subscription?.currentPeriodEnd;
    if (periodEnd) {
      // sessionStorage (tab-scoped) — ephemeral nudge, не durable prefs.
      // `safeWriteSS` — sanctioned helper (no raw sessionStorage, тримає
      // `sergeant-design/no-raw-local-storage`-budget на нулі).
      safeWriteSS(dismissKey(periodEnd), "1");
    }
  }

  if (!open) return null;

  const copy =
    variant === "B"
      ? paywallTrialDay7Copy.variantB
      : paywallTrialDay7Copy.variantA;

  // `exactOptionalPropertyTypes: true` забороняє явно передавати `undefined`
  // у optional-пропси, тож `socialProof` (є лише у variant B) додаємо через
  // conditional-spread, а не `socialProof={... : undefined}`.
  const modalProps: PaywallModalProps = {
    open,
    onClose: handleClose,
    surface: "trial_day7",
    variant,
    title: copy.title,
    description: copy.description,
    features: copy.features,
    ctaLabel: copy.ctaLabel,
    dismissLabel: copy.dismissLabel,
    ...("socialProof" in copy ? { socialProof: copy.socialProof } : {}),
  };

  return <PaywallModal {...modalProps} />;
}
