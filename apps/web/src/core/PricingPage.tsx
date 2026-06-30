import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@shared/lib/ui/cn";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { useToast } from "@shared/hooks/useToast";
import { useLocale } from "@shared/i18n/useLocale";
import type { BillingCheckoutResponse } from "@sergeant/api-client";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { captureException } from "./observability/sentry";
import { usePlan } from "./billing/usePlan";
import { WaitlistForm } from "./pricing/WaitlistForm";
import { LegalLinks } from "./legal/LegalLinks";

/**
 * Phase 7 D3 — Pricing tiers (one paid tier).
 *
 * Decision locked в `docs/design/redesign-v2/phase-7-product-decisions-2026-05-22.md`:
 *   Free → Premium €X/міс. No Plus/Pro split, no Lifetime, no trial-only gate.
 *
 * v2 chrome: `<MeshBackground>` shell, `<Card prominence="hero">` для Premium,
 * `<Card prominence="default">` для Free, `text-style-display-hero` для ціни,
 * `text-style-headline` для назви тіра.
 *
 * Internals: checkout flow та billing API лишаються незмінні — серверний
 * `BillingPlan` enum усе ще `"plus" | "pro"`, тому під капотом ми передаємо
 * `plan: "pro"`. User-facing label = "Premium" (D3). Перейменування серверного
 * enum — окремий PR на бекенд.
 */

interface Feature {
  readonly label: string;
  /** Free-tier limit annotation. Premium = unlocked, тому залишай undefined там. */
  readonly limit?: string;
  /** Якщо `false` — рядок стилізується як "недоступно" (Free-only, gated на Premium). */
  readonly included?: boolean;
}

interface Tier {
  readonly id: "free" | "premium";
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly features: ReadonlyArray<Feature>;
  readonly highlight: boolean;
}

// Canonical monthly price for the Premium tier (₴199/міс, ₴1490/рік).
// Cadence line carries the billing period text from the locale catalog.
const PREMIUM_PRICE_MONTHLY = "₴199";

// Defense-in-depth open-redirect guard (audit F4,
// docs/audits/2026-05-13-page-audit-10-errors-pwa-marketing.md). Backend
// returns checkout.url / portal.url від Stripe; додатково валідовуємо host
// на клієнті — щоб контракт-дрифт чи компроментація бекенду не змогли
// перевести юзера на довільний origin у high-trust моменті funnel-у.
const ALLOWED_CHECKOUT_HOSTS: ReadonlySet<string> = new Set([
  "checkout.stripe.com",
  "billing.stripe.com",
]);

function assertAllowedCheckoutUrl(raw: string): string {
  const parsed = new URL(raw);
  if (!ALLOWED_CHECKOUT_HOSTS.has(parsed.host)) {
    throw new Error(`checkout url host not in allow-list: ${parsed.host}`);
  }
  return parsed.toString();
}

/**
 * Build the per-locale TIERS array. Lives inside PricingPage so `useLocale`
 * messages can drive every label; memoized on `messages` identity since the
 * resolver returns a frozen reference per locale (the array recomputes only
 * when the user toggles language, not on every parent render).
 */
function buildTiers(
  pricing: ReturnType<typeof useLocale>["messages"]["pricing"],
): ReadonlyArray<Tier> {
  const limits = pricing.limits;
  const features = pricing.features;
  return [
    {
      id: "free",
      name: pricing.tiers.freeName,
      price: pricing.tiers.freePrice,
      cadence: pricing.tiers.freeCadence,
      tagline: pricing.tiers.freeTagline,
      highlight: false,
      features: [
        { label: features.allModules },
        { label: features.manualTracking },
        { label: features.aiChat, limit: limits.aiChatPerDay },
        { label: features.cloudSync2Devices },
        { label: features.pdfExport, included: false },
        { label: features.multiCurrency, included: false },
        { label: features.monoAutoSync, included: false },
      ],
    },
    {
      id: "premium",
      name: pricing.tiers.premiumName,
      price: PREMIUM_PRICE_MONTHLY,
      cadence: pricing.tiers.premiumCadence,
      tagline: pricing.tiers.premiumTagline,
      highlight: true,
      features: [
        { label: features.expensesFinyk, limit: limits.unlimited },
        { label: features.aiPhotoFoodShort, limit: limits.unlimited },
        { label: features.workoutTemplates, limit: limits.unlimited },
        { label: features.habits, limit: limits.unlimited },
        { label: features.pdfExport },
        { label: features.multiCurrency },
        { label: features.cloudSync },
      ],
    },
  ];
}

export function PricingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const checkoutReturnHandledRef = useRef(false);
  const [checkoutPlan, setCheckoutPlan] = useState<Tier["id"] | null>(null);
  const [checkoutResult, setCheckoutResult] =
    useState<BillingCheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const { isPro: isPremiumActive } = usePlan();
  // i18n. Resolved messages frozen per-locale у resolver → memo identity
  // stable, `tiers` recomputes лише при locale-flip (rare).
  const { messages } = useLocale();
  const t = messages.pricing;
  const tiers = useMemo(() => buildTiers(t), [t]);

  // Pageview-аналітика. `source` (з useSearchParams) дозволяє розрізнити
  // "user натиснув CTA з paywall" vs "user сам зайшов на /pricing". Залежимо
  // саме від похідного `viewSource`-рядка, а не від усього `searchParams`-
  // обʼєкта: інакше чистка `?checkout=...` нижче (setSearchParams) міняла б
  // референс і повторно слала б PRICING_VIEWED з тим самим source (audit F25
  // + cubic: дубль pageview при поверненні зі Stripe).
  const viewSource = searchParams.get("source") ?? "direct";
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source: viewSource });
  }, [viewSource]);

  // Stripe Checkout повертає юзера на `/pricing?checkout=success` (success_url)
  // або `/pricing?checkout=cancel|cancelled` (cancel_url). `success` означає, що
  // webhook міг ще не долетіти / `billingApi.status` у кеші лишається stale →
  // інвалідовуємо `billingKeys.status` (Hard Rule #2), щоб `usePlan` пере-fetch-нувся
  // і paywall пропустив користувача. Toast із action веде в Settings, де живе
  // керування підпискою. URL чистимо через `setSearchParams({}, { replace: true })`
  // — щоб при reload / share-і URL знову не тригерив toast. ref-guard
  // захищає від StrictMode double-invoke в dev.
  useEffect(() => {
    if (checkoutReturnHandledRef.current) return;
    const checkout = searchParams.get("checkout");
    if (
      checkout !== "success" &&
      checkout !== "cancel" &&
      checkout !== "cancelled"
    )
      return;
    checkoutReturnHandledRef.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("checkout");
    setSearchParams(next, { replace: true });
    if (checkout === "success") {
      void queryClient.invalidateQueries({ queryKey: billingKeys.status });
      toast.success(t.toast.subscriptionActive, undefined, {
        label: t.toast.subscriptionActiveCta,
        onClick: () => navigate("/settings"),
      });
      return;
    }
    toast.info(t.toast.paymentCanceled);
  }, [searchParams, setSearchParams, queryClient, toast, navigate, t]);

  async function handlePremiumCta(): Promise<void> {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "pro",
      cta: "stripe_checkout",
    });
    setCheckoutPlan("premium");
    setCheckoutError(null);
    setCheckoutResult(null);
    try {
      // Server `BillingPlan` enum усе ще `"plus" | "pro"` — D3 змінює лише
      // UI-label, не серверний контракт. Майбутній PR на бекенд може
      // переіменувати у `"premium"`, але це окрема міграція.
      const checkout = await billingApi.createCheckout({ plan: "pro" });
      setCheckoutResult(checkout);
      trackEvent(ANALYTICS_EVENTS.CHECKOUT_OPENED, {
        plan: "pro",
        mode: checkout.mode,
      });
      // Audit F4: refuse to navigate if server returned a non-Stripe host.
      const safeUrl = assertAllowedCheckoutUrl(checkout.url);
      window.location.assign(safeUrl);
      return;
    } catch (err) {
      captureException(err, {
        tags: { scope: "pricing-checkout-redirect" },
      });
      setCheckoutError(t.errors.checkoutUnavailable);
      const anchor = document.getElementById("waitlist-anchor");
      if (anchor && typeof anchor.scrollIntoView === "function") {
        anchor.scrollIntoView({
          behavior: motionScrollBehavior(),
          block: "start",
        });
      }
    } finally {
      setCheckoutPlan(null);
    }
  }

  function handleFreeCta(): void {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "free",
      cta: "free",
    });
    // Downgrade flow з Premium → Free поки не існує (керується через
    // Stripe customer portal в Settings). Кнопка disabled у такому стані.
    if (isPremiumActive) return;
    // Free-тір вже доступний за замовчуванням — нікуди не ведемо.
  }

  // Stripe Customer Portal — initiative 0010 Phase 4.2 residual. Активний
  // subscriber бачить "Керувати підпискою" замість "Спробувати Premium":
  // POST /api/billing/portal -> short-lived URL -> redirect. 409
  // `NO_BILLING_CUSTOMER` означає, що у юзера є локальний plan='pro', але
  // нема `provider_customer_id` (manual upgrade через internal endpoint,
  // або pre-Stripe legacy) — кажемо звернутись у саппорт. 503 = billing
  // вимкнено (Stripe env-и не задані), показуємо нейтральний fallback.
  async function handleManageSubscription(): Promise<void> {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: "pro",
      cta: "stripe_portal",
    });
    setPortalLoading(true);
    setPortalError(null);
    try {
      const { url } = await billingApi.createPortal();
      // Audit F4: refuse to navigate if server returned a non-Stripe host.
      const safeUrl = assertAllowedCheckoutUrl(url);
      window.location.assign(safeUrl);
    } catch (err) {
      const status =
        err && typeof err === "object" && "status" in err
          ? (err as { status?: unknown }).status
          : undefined;
      if (status === 409) {
        setPortalError(t.errors.portalNoBillingCustomer);
      } else if (status === 503) {
        setPortalError(t.errors.portalUnavailable);
      } else {
        captureException(err, {
          tags: { scope: "pricing-checkout-redirect" },
        });
        setPortalError(t.errors.portalGeneric);
      }
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <MeshBackground
      className="overflow-y-auto"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <main id="main" tabIndex={-1} className="w-full outline-none">
        <div className="max-w-5xl mx-auto px-5 pb-12 space-y-10">
          <header className="flex items-center gap-3 pt-6 pb-2">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => navigate(-1)}
              aria-label={t.backLabel}
            >
              <Icon name="chevron-left" size={20} />
            </Button>
            <h1 className="text-style-title text-text">{t.pageTitle}</h1>
          </header>

          <section className="space-y-3 text-center">
            <h2 className="text-style-headline text-text leading-tight">
              {t.hero.headlineLine1}
              <br />
              {t.hero.headlineLine2}
            </h2>
            <p className="text-style-body text-muted max-w-2xl mx-auto">
              {t.hero.subtitle}
            </p>
            {checkoutResult ? (
              <p className="text-style-body-sm text-success-strong">
                {t.status.checkoutCreatedPrefix} ({checkoutResult.mode} mode).
              </p>
            ) : null}
            {checkoutError ? (
              <p className="text-style-body-sm text-danger-strong" role="alert">
                {checkoutError}
              </p>
            ) : null}
            {portalError ? (
              <p className="text-style-body-sm text-danger-strong" role="alert">
                {portalError}
              </p>
            ) : null}
          </section>

          <section
            className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full"
            aria-label={t.plansAriaLabel}
          >
            {tiers.map((tier, idx) => {
              const isPremium = tier.id === "premium";
              const isCurrent =
                (isPremium && isPremiumActive) ||
                (!isPremium && !isPremiumActive);
              const checkoutLoading = checkoutPlan === tier.id;
              // Для активного Premium-юзера Premium-CTA веде у Stripe
              // Customer Portal (керування підпискою / скасування /
              // оновлення картки) — це закриває Phase 4.2 residual з
              // initiative 0010. Для не-subscriber це звичайний
              // checkout-flow.
              const ctaLabel = isPremium
                ? isPremiumActive
                  ? portalLoading
                    ? t.cta.openingPortal
                    : t.cta.manageSubscription
                  : checkoutLoading
                    ? t.cta.openingCheckout
                    : t.cta.tryPremium
                : isPremiumActive
                  ? t.cta.switchToFree
                  : t.cta.currentPlan;
              const ctaDisabled = isPremium
                ? isPremiumActive
                  ? portalLoading
                  : checkoutLoading
                : // Free CTA: disabled both для активного Free-юзера
                  // (вже ваш план) і для Premium-юзера (downgrade flow
                  // живе у Stripe portal через Settings, не тут).
                  true;
              const onPremiumClick = isPremiumActive
                ? handleManageSubscription
                : handlePremiumCta;

              return (
                <Card
                  key={tier.id}
                  as="article"
                  module={isPremium ? "finyk" : undefined}
                  prominence={isPremium ? "hero" : "default"}
                  radius="r-2xl"
                  padding="lg"
                  className={cn(
                    "flex flex-col gap-4 motion-safe:animate-stagger-in",
                    isPremium && "ring-1 ring-brand-200/40",
                  )}
                  style={{ animationDelay: `${idx * 100}ms` }}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <header className="space-y-1">
                    <h3 className="text-style-headline text-text">
                      {tier.name}
                    </h3>
                    <p className="text-style-body-sm text-muted">
                      {tier.tagline}
                    </p>
                  </header>

                  <div className="space-y-1">
                    <span className="text-style-display-hero text-text tabular-nums">
                      {tier.price}
                    </span>
                    <span className="block text-style-body-sm text-muted">
                      {tier.cadence}
                    </span>
                  </div>

                  <ul className="space-y-2 grow">
                    {tier.features.map((f) => {
                      const excluded = f.included === false;
                      return (
                        <li
                          key={f.label}
                          className={cn(
                            "flex items-start gap-2 text-style-body-sm",
                            excluded ? "text-subtle" : "text-text",
                          )}
                        >
                          <Icon
                            name={excluded ? "close" : "check"}
                            size={16}
                            className={cn(
                              "mt-0.5 shrink-0",
                              excluded ? "text-subtle" : "text-brand-strong",
                            )}
                          />
                          <span className="min-w-0">
                            <span>{f.label}</span>
                            {f.limit ? (
                              <span className="block text-style-caption text-subtle">
                                {f.limit}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <Button
                    variant={isPremium ? "primary" : "secondary"}
                    size="md"
                    onClick={isPremium ? onPremiumClick : handleFreeCta}
                    disabled={ctaDisabled}
                  >
                    {ctaLabel}
                  </Button>
                </Card>
              );
            })}
          </section>

          <section
            id="waitlist-anchor"
            className="rounded-3xl border border-line bg-panel p-6 sm:p-8 max-w-2xl mx-auto"
          >
            <header className="space-y-2 mb-6">
              <h2 className="text-style-headline text-text">
                {t.waitlist.headline}
              </h2>
              <p className="text-style-body-sm text-muted">
                {t.waitlist.subtitle}
              </p>
            </header>
            <WaitlistForm source="pricing_page" />
          </section>

          <footer className="text-center text-style-caption text-muted space-y-1">
            <p>{t.footer}</p>
            <LegalLinks compact />
          </footer>
        </div>
      </main>
    </MeshBackground>
  );
}
