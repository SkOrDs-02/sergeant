import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { billingApi } from "@shared/api";
import type { BillingCheckoutResponse } from "@sergeant/api-client";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { WaitlistForm } from "./pricing/WaitlistForm";

interface Tier {
  id: "free" | "pro";
  name: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  tagline: string;
  trial?: string;
  features: ReadonlyArray<string>;
}

const TIERS: ReadonlyArray<Tier> = [
  {
    id: "free",
    name: "Free",
    price: "₴0",
    cadence: "назавжди",
    tagline: "Усі 4 розділи базово. Local-first, без cloud.",
    features: [
      "Усі розділи: Фінік / Фізрук / Харчування / Рутина",
      "AI-чат: 5 повідомлень на день",
      "Manual Mono-імпорт (без webhook)",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$7",
    cadence: "/міс або $49/рік (~$4/міс)",
    highlight: true,
    trial: "7 днів без картки",
    tagline: "Безлімітний AI + CloudSync + Авто-Mono.",
    features: [
      "Безлімітний AI-чат",
      "Авто-Mono sync (webhook)",
      "CloudSync між пристроями",
      "Усе з Free-тіра",
    ],
  },
];

export function PricingPage() {
  const navigate = useNavigate();
  const [checkoutPlan, setCheckoutPlan] = useState<Tier["id"] | null>(null);
  const [checkoutResult, setCheckoutResult] =
    useState<BillingCheckoutResponse | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Pageview-аналітика. Window.location.search парситься щоб ми могли
  // розрізнити "user натиснув CTA з paywall" vs "user сам зайшов на /pricing".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source") ?? "direct";
    trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source });
  }, []);

  async function handleTierCta(tierId: Tier["id"]): Promise<void> {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: tierId,
      cta: tierId === "free" ? "free" : "stripe_checkout",
    });
    if (tierId !== "free") {
      setCheckoutPlan(tierId);
      setCheckoutError(null);
      setCheckoutResult(null);
      try {
        const checkout = await billingApi.createCheckout({ plan: tierId });
        setCheckoutResult(checkout);
        trackEvent(ANALYTICS_EVENTS.CHECKOUT_OPENED, {
          plan: tierId,
          mode: checkout.mode,
        });
        window.location.assign(checkout.url);
        return;
      } catch {
        setCheckoutError(
          "Оплата тимчасово недоступна. Можеш залишити email нижче, і ми повернемось з checkout-link.",
        );
      } finally {
        setCheckoutPlan(null);
      }
    }
    const anchor = document.getElementById("waitlist-anchor");
    if (anchor && typeof anchor.scrollIntoView === "function") {
      anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div
      className="min-h-dvh bg-bg"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
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
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional marketing eyebrow above the hero headline; не існує SectionHeading-eyebrow API. */}
          <p className="text-xs uppercase tracking-wider text-brand-strong font-semibold">
            Stripe Checkout
          </p>
          <h2 className="text-style-hero sm:text-4xl text-text leading-tight">
            Sergeant буде безкоштовним для більшості.
            <br />
            Pro — для тих, хто хоче усе одразу.
          </h2>
          <p className="text-base text-muted max-w-2xl mx-auto">
            Pro відкриває Stripe Checkout. Якщо білінг недоступний у цьому
            середовищі, залиш email нижче — це fallback без списань.
          </p>
          {checkoutResult ? (
            <p className="text-sm text-success-strong">
              Checkout session створено ({checkoutResult.mode} mode).
            </p>
          ) : null}
          {checkoutError ? (
            <p className="text-sm text-danger-strong" role="alert">
              {checkoutError}
            </p>
          ) : null}
        </section>

        <section
          className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto w-full"
          aria-label="Тарифні плани"
        >
          {TIERS.map((tier, idx) => (
            <article
              key={tier.id}
              className={cn(
                "rounded-3xl border p-6 flex flex-col gap-4",
                "transition-all duration-300 ease-out",
                "pointer-fine:hover:shadow-float pointer-fine:hover:-translate-y-1",
                "motion-safe:animate-stagger-in",
                tier.highlight
                  ? "border-brand-500 bg-panel shadow-glow"
                  : "border-line bg-panel pointer-fine:hover:border-brand-200/50",
              )}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <header className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-style-title text-text">{tier.name}</h3>
                  {tier.trial && (
                    // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- trial badge на Pro картці.
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-strong bg-brand/10 px-2 py-1 rounded-full">
                      {tier.trial}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{tier.tagline}</p>
              </header>

              <div className="space-y-1">
                <span className="text-style-hero text-text">{tier.price}</span>
                <span className="block text-sm text-muted">{tier.cadence}</span>
              </div>

              <ul className="space-y-2 grow">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm text-text"
                  >
                    <Icon
                      name="check"
                      size={16}
                      className="text-brand-strong mt-0.5 shrink-0"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.highlight ? "primary" : "secondary"}
                size="md"
                onClick={() => handleTierCta(tier.id)}
                disabled={checkoutPlan === tier.id}
              >
                {tier.id === "free"
                  ? "Лишусь на Free"
                  : checkoutPlan === tier.id
                    ? "Відкриваємо checkout…"
                    : "Перейти до оплати"}
              </Button>
            </article>
          ))}
        </section>

        <section
          id="waitlist-anchor"
          className="rounded-3xl border border-line bg-panel p-6 sm:p-8 max-w-2xl mx-auto"
        >
          <header className="space-y-2 mb-6">
            <h2 className="text-style-hero text-text">
              Залишити email для waitlist
            </h2>
            <p className="text-sm text-muted">
              Один лист, коли Pro стартує. Без спаму, без авто-списань.
            </p>
          </header>
          <WaitlistForm source="pricing_page" />
        </section>

        <footer className="text-center text-xs text-muted space-y-1">
          <p>
            Ціни у USD; для UA-ринку виставляємо ₴-еквівалент через Stripe.
            Після EN-лендингу додамо $/€ для міжнародної аудиторії.
          </p>
        </footer>
      </div>
    </div>
  );
}
