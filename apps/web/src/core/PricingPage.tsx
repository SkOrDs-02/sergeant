import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { MeshBackground } from "@shared/components/layout/MeshBackground";
import { billingApi } from "@shared/api";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { useToast } from "@shared/hooks/useToast";
import type { BillingCheckoutResponse } from "@sergeant/api-client";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { usePlan } from "./billing/usePlan";
import { WaitlistForm } from "./pricing/WaitlistForm";

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

// Placeholder — real price locked in pricing strategy PR (D3 § Out of scope).
// Tracked: docs/design/redesign-v2/phase-7-product-decisions-2026-05-22.md → D3.
const PREMIUM_PRICE_MONTHLY_PLACEHOLDER = "€X";

// Free-tier limits (first-pass, TENTATIVE — to be A/B-tested per D3 § Out of scope).
// Сходити в pricing strategy PR після того, як буде market research input.
const FREE_LIMIT_EXPENSES = 30;
const FREE_LIMIT_MEAL_PHOTOS = 20;
const FREE_LIMIT_ACTIVE_WORKOUTS = 1;
const FREE_LIMIT_ACTIVE_HABITS = 5;

const TIERS: ReadonlyArray<Tier> = [
  {
    id: "free",
    name: "Free",
    price: "€0",
    cadence: "назавжди",
    tagline: "Базові ліміти у всіх 4 модулях. Local-first, без cloud.",
    highlight: false,
    features: [
      { label: "Витрати у Фініку", limit: `${FREE_LIMIT_EXPENSES} / місяць` },
      {
        label: "AI-фото їжі у Харчуванні",
        limit: `${FREE_LIMIT_MEAL_PHOTOS} / місяць`,
      },
      { label: "Ручні прийоми їжі", limit: "без ліміту" },
      {
        label: "Активний шаблон тренування",
        limit: `${FREE_LIMIT_ACTIVE_WORKOUTS}`,
      },
      { label: "Активні звички", limit: `${FREE_LIMIT_ACTIVE_HABITS}` },
      { label: "PDF-експорт звітів", included: false },
      { label: "Мульти-валютні рахунки", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    price: PREMIUM_PRICE_MONTHLY_PLACEHOLDER,
    cadence: "/міс",
    tagline: "Усе розблоковано. Один план — без рівнів і доплат.",
    highlight: true,
    features: [
      { label: "Витрати у Фініку", limit: "без ліміту" },
      { label: "AI-фото їжі", limit: "без ліміту" },
      { label: "Шаблони тренувань", limit: "без ліміту" },
      { label: "Звички", limit: "без ліміту" },
      { label: "PDF-експорт звітів" },
      { label: "Мульти-валютні рахунки" },
      { label: "CloudSync між пристроями" },
    ],
  },
];

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
  const { isPro: isPremiumActive } = usePlan();

  // Pageview-аналітика. Window.location.search парситься щоб ми могли
  // розрізнити "user натиснув CTA з paywall" vs "user сам зайшов на /pricing".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source") ?? "direct";
    trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source });
  }, []);

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
      toast.success(
        "Підписку активовано — ласкаво просимо в Premium!",
        undefined,
        {
          label: "Перейти у налаштування",
          onClick: () => navigate("/settings"),
        },
      );
      return;
    }
    toast.info("Оплату скасовано. Підписка не оформлена.");
  }, [searchParams, setSearchParams, queryClient, toast, navigate]);

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
      window.location.assign(checkout.url);
      return;
    } catch {
      setCheckoutError(
        "Оплата тимчасово недоступна. Можеш залишити email нижче, і ми повернемось з checkout-link.",
      );
      const anchor = document.getElementById("waitlist-anchor");
      if (anchor && typeof anchor.scrollIntoView === "function") {
        anchor.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <MeshBackground
      className="overflow-y-auto"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="w-full">
        <div className="max-w-5xl mx-auto px-5 pb-12 space-y-10">
          <header className="flex items-center gap-3 pt-6 pb-2">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              onClick={() => navigate(-1)}
              aria-label="Назад"
            >
              <Icon name="chevron-left" size={20} />
            </Button>
            <h1 className="text-style-title text-text">Тарифи</h1>
          </header>

          <section className="space-y-3 text-center">
            <h2 className="text-style-headline text-text leading-tight">
              Sergeant безкоштовний для базового користування.
              <br />
              Premium — коли треба все одразу.
            </h2>
            <p className="text-style-body text-muted max-w-2xl mx-auto">
              Один платний план. Без рівнів, без довічної підписки, без
              trial-таймера. Натиснеш Premium — відкриється Stripe Checkout.
            </p>
            {checkoutResult ? (
              <p className="text-style-body-sm text-success-strong">
                Checkout session створено ({checkoutResult.mode} mode).
              </p>
            ) : null}
            {checkoutError ? (
              <p className="text-style-body-sm text-danger-strong" role="alert">
                {checkoutError}
              </p>
            ) : null}
          </section>

          <section
            className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto w-full"
            aria-label="Тарифні плани"
          >
            {TIERS.map((tier, idx) => {
              const isPremium = tier.id === "premium";
              const isCurrent =
                (isPremium && isPremiumActive) ||
                (!isPremium && !isPremiumActive);
              const checkoutLoading = checkoutPlan === tier.id;
              const ctaLabel = isPremium
                ? checkoutLoading
                  ? "Відкриваємо checkout…"
                  : isPremiumActive
                    ? "Зараз ваш план"
                    : "Спробувати Premium"
                : isPremiumActive
                  ? "Перейти на Free"
                  : "Зараз ваш план";
              const ctaDisabled = isPremium
                ? checkoutLoading || isPremiumActive
                : // Free CTA: disabled both для активного Free-юзера
                  // (вже ваш план) і для Premium-юзера (downgrade flow
                  // живе у Stripe portal через Settings, не тут).
                  true;

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
                    onClick={isPremium ? handlePremiumCta : handleFreeCta}
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
                Email для waitlist
              </h2>
              <p className="text-style-body-sm text-muted">
                Один лист, коли Premium стартує. Без спаму, без авто-списань.
              </p>
            </header>
            <WaitlistForm source="pricing_page" />
          </section>

          <footer className="text-center text-style-caption text-muted space-y-1">
            <p>
              Ціни у EUR; для UA-ринку Stripe виставляє ₴-еквівалент. Фінальна
              цифра — у pricing-strategy PR після market-research.
            </p>
          </footer>
        </div>
      </div>
    </MeshBackground>
  );
}
