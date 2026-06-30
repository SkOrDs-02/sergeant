import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { BrandLogo } from "./app/BrandLogo";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { PRICING_PATH, SIGN_IN_PATH, WELCOME_PATH } from "./app/appPaths";
import { WaitlistForm } from "./pricing/WaitlistForm";
import { LegalLinks } from "./legal/LegalLinks";
import { useLocale } from "@shared/i18n/useLocale";

// Phase 6.2 landing surface (initiative 0010, ADR-0051). Публічний `/`
// для SEO/paid-acquisition: non-auth відвідувач бачить hero з copy у
// локалі, що визначається через `useLocale()` (query param `?lang=`,
// localStorage або DEFAULT_LOCALE="uk"). Analytics payloads
// `LANDING_VIEWED` і `LANDING_EMAIL_CAPTURED` тепер несуть динамічний
// `locale` відповідно до resolved locale, а не хардкоду.
//
// Інтеграція в shell — через `STANDALONE_ROUTES` (web-architecture-state
// roast §1.2 typed registry). Гейт у `StandaloneRoutes.tsx` обмежує
// рендер на `!authLoading && !user && shouldShowOnboarding()`, тож
// local-first юзери (які вже мають дані без облікового запису) НЕ
// бачать маркетинговий лендинг кожного візиту — для них `/`
// продовжує fall-through-итися у Hub home як раніше.

interface FeatureBullet {
  readonly icon: "sparkles" | "cloud-off" | "check-circle";
  readonly title: string;
  readonly body: string;
}

// Icons for the three trust bullets — locale-invariant, ordered to match
// uk.ts / en.ts feature key order: ai → localFirst → noHidden.
const FEATURE_ICON_AI = "sparkles" as const;
const FEATURE_ICON_LOCAL_FIRST = "cloud-off" as const;
const FEATURE_ICON_NO_HIDDEN = "check-circle" as const;

interface LandingPageProps {
  /**
   * Викликається, коли користувач обирає «Спробувати без облікового
   * запису» — повертає у standard onboarding-flow (`/welcome`).
   * `App.tsx` уже знає, як рендерити splash для cold-start-у.
   */
  readonly onContinueWithoutAccount?: () => void;
}

export function LandingPage({ onContinueWithoutAccount }: LandingPageProps) {
  const navigate = useNavigate();
  const { locale, messages } = useLocale();
  const t = messages.landing;

  // Build the features array from catalog at render time — locale-aware and
  // still array-mapped to avoid inline JSX literals. Titles used as React keys
  // (stable within a locale; locale switch remounts the whole page anyway).
  const features: ReadonlyArray<FeatureBullet> = [
    {
      icon: FEATURE_ICON_AI,
      title: t.features.aiTitle,
      body: t.features.aiBody,
    },
    {
      icon: FEATURE_ICON_LOCAL_FIRST,
      title: t.features.localFirstTitle,
      body: t.features.localFirstBody,
    },
    {
      icon: FEATURE_ICON_NO_HIDDEN,
      title: t.features.noHiddenTitle,
      body: t.features.noHiddenBody,
    },
  ];

  // `LANDING_VIEWED` стріляє один раз на маунт. Payload відповідає
  // canonical contract з `analyticsEvents.ts`: { path, locale, referrer? }.
  // `referrer` беремо з `document.referrer` (порожній рядок коли
  // користувач прийшов напряму), щоб PostHog міг розбити вхідний
  // трафік по джерелах (organic, paid, direct).
  // `locale` is now dynamic — resolved from URL param / localStorage / default.
  useEffect(() => {
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, {
      path: "/",
      locale,
      ...(referrer ? { referrer } : {}),
    });
    // Mount-only landing-view analytics — fire once per page mount, not on
    // every locale/reference change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToSignIn() {
    navigate(SIGN_IN_PATH);
  }

  function goToPricing() {
    // `?source=landing` дозволяє PricingPage-у атрибутувати pageview
    // на маркетинговий лендинг (інакше source defaults to "direct").
    navigate(`${PRICING_PATH}?source=landing`);
  }

  function tryWithoutAccount() {
    if (onContinueWithoutAccount) {
      onContinueWithoutAccount();
      return;
    }
    navigate(WELCOME_PATH);
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="min-h-dvh bg-bg outline-none"
      style={{
        paddingTop: "max(1.25rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="max-w-5xl mx-auto px-5 pb-12 space-y-12">
        <header className="flex items-center justify-between pt-4">
          <BrandLogo as="h1" size="md" />
          <Button
            variant="ghost"
            size="sm"
            onClick={goToSignIn}
            aria-label={t.signInAria}
          >
            {t.signIn}
          </Button>
        </header>

        <section
          className="space-y-5 text-center pt-6"
          aria-label={t.heroAriaLabel}
        >
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- маркетинговий eyebrow над заголовком; такий самий патерн використовує PricingPage. */}
          <p className="text-xs uppercase tracking-wider text-brand-strong font-semibold">
            {t.eyebrow}
          </p>
          <h2 className="text-style-hero sm:text-4xl text-text leading-tight">
            {t.heroHeadline.split("\n").map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </span>
            ))}
          </h2>
          <p className="text-base text-muted max-w-2xl mx-auto">
            {t.heroSubcopy}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={goToSignIn}
              data-testid="landing-register-cta"
            >
              {t.registerCta}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={goToSignIn}
              data-testid="landing-login-cta"
            >
              {t.loginCta}
            </Button>
          </div>
          <button
            type="button"
            onClick={tryWithoutAccount}
            className={cn(
              "text-sm text-muted hover:text-text underline-offset-4",
              "focus:outline-none focus-visible:underline focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg rounded-md",
              "transition-colors duration-150",
            )}
            data-testid="landing-skip-cta"
          >
            {t.skipCta}
          </button>
        </section>

        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          aria-label={t.featuresAriaLabel}
        >
          {features.map((feature, idx) => (
            <article
              key={feature.title}
              className={cn(
                "rounded-3xl border border-line bg-panel p-5 space-y-3",
                "transition-all duration-300 ease-out",
                "pointer-fine:hover:shadow-float pointer-fine:hover:-translate-y-1",
                "motion-safe:animate-stagger-in",
              )}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div
                className={cn(
                  "inline-flex items-center justify-center",
                  "h-10 w-10 rounded-2xl bg-brand-soft text-brand-strong",
                )}
                aria-hidden="true"
              >
                <Icon name={feature.icon} size={20} />
              </div>
              <h3 className="text-style-title text-text">{feature.title}</h3>
              <p className="text-sm text-muted leading-relaxed">
                {feature.body}
              </p>
            </article>
          ))}
        </section>

        <section
          className="rounded-3xl border border-line bg-panel p-6 sm:p-8 space-y-4"
          aria-label={t.waitlistAriaLabel}
        >
          <div className="max-w-2xl mx-auto text-center space-y-2">
            <h2 className="text-style-hero text-text">{t.waitlistHeadline}</h2>
            <p className="text-sm text-muted">{t.waitlistSubcopy}</p>
          </div>
          <WaitlistForm
            source="landing"
            defaultTier="pro"
            className="max-w-xl mx-auto"
            onSuccess={() => {
              trackEvent(ANALYTICS_EVENTS.LANDING_EMAIL_CAPTURED, {
                source: "hero",
                locale,
              });
            }}
          />
        </section>

        <section
          className="rounded-3xl border border-line bg-panel p-6 sm:p-8 text-center space-y-3"
          aria-label={t.pricingAriaLabel}
        >
          <h2 className="text-style-hero text-text">{t.pricingHeadline}</h2>
          <p className="text-sm text-muted max-w-xl mx-auto">
            {t.pricingSubcopy}
          </p>
          <div className="pt-2 flex items-center justify-center">
            <Button
              variant="secondary"
              size="md"
              onClick={goToPricing}
              data-testid="landing-pricing-link"
            >
              {t.pricingCta}
              <Icon name="chevron-right" size={16} className="ml-1" />
            </Button>
          </div>
        </section>

        <footer className="text-center text-xs text-muted space-y-1">
          <p>{t.footerText}</p>
          <LegalLinks compact />
        </footer>
      </div>
    </main>
  );
}

export default LandingPage;
