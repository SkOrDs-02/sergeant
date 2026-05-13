import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { BrandLogo } from "./app/BrandLogo";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { PRICING_PATH, SIGN_IN_PATH, WELCOME_PATH } from "./app/appPaths";

// Phase 6.1 landing surface (initiative 0010, ADR-0051). Публічний `/`
// для SEO/paid-acquisition: non-auth відвідувач бачить hero з UA-copy,
// прямі CTA Увійти / Створити акаунт і лінк на `/pricing`. EN locale
// (Phase 6.2) — окремий PR; тут залишаємо `locale: "uk"` хардкодом, щоб
// `LANDING_VIEWED` payload відповідав canonical contract з
// `packages/shared/src/lib/analyticsEvents.ts § Landing page`.
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

// Trust-bullet-и для hero-секції. Тримаємо як readonly-масив (не масив
// JSX), щоб layout-секція мапила без inline-літералів — легше
// перевірити в тесті за `title`.
const FEATURES: ReadonlyArray<FeatureBullet> = [
  {
    icon: "sparkles",
    title: "AI-помічник у кишені",
    body: "Чат, що знає твої фінанси, тренування, харчування і рутину — і пропонує наступний крок.",
  },
  {
    icon: "cloud-off",
    title: "Local-first за замовчуванням",
    body: "Дані живуть на твоєму пристрої. Cloud sync — опціональний (Pro), не вмикається без твого підтвердження.",
  },
  {
    icon: "check-circle",
    title: "Без зайвих списань",
    body: "Free-тір — назавжди. Pro — 7 днів тріал без картки, $7/міс або ₴-еквівалент для UA.",
  },
];

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

  // `LANDING_VIEWED` стріляє один раз на маунт. Payload відповідає
  // canonical contract з `analyticsEvents.ts`: { path, locale, referrer? }.
  // `referrer` беремо з `document.referrer` (порожній рядок коли
  // користувач прийшов напряму), щоб PostHog міг розбити вхідний
  // трафік по джерелах (organic, paid, direct).
  useEffect(() => {
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    trackEvent(ANALYTICS_EVENTS.LANDING_VIEWED, {
      path: "/",
      locale: "uk",
      ...(referrer ? { referrer } : {}),
    });
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
    <div
      className="min-h-dvh bg-bg"
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
            aria-label="Увійти в обліковий запис"
          >
            Увійти
          </Button>
        </header>

        <section
          className="space-y-5 text-center pt-6"
          aria-label="Hero — анонс Sergeant"
        >
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- маркетинговий eyebrow над заголовком; такий самий патерн використовує PricingPage. */}
          <p className="text-xs uppercase tracking-wider text-brand-strong font-semibold">
            Local-first · AI · Українською
          </p>
          <h2 className="text-style-hero sm:text-4xl text-text leading-tight">
            Один помічник для фінансів, тренувань,
            <br />
            харчування і рутини.
          </h2>
          <p className="text-base text-muted max-w-2xl mx-auto">
            Sergeant обʼєднує чотири модулі — Фінік, Фізрук, Харчування, Рутина
            — в один AI-чат, що памʼятає твої цілі і пропонує наступний крок.
            Без хмари за замовчуванням, з повним контролем над даними.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={goToSignIn}
              data-testid="landing-register-cta"
            >
              Створити акаунт
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={goToSignIn}
              data-testid="landing-login-cta"
            >
              Вже маю акаунт
            </Button>
          </div>
          <button
            type="button"
            onClick={tryWithoutAccount}
            className={cn(
              "text-sm text-muted hover:text-text underline-offset-4",
              "focus-visible:outline-none focus-visible:underline",
              "transition-colors duration-150",
            )}
            data-testid="landing-skip-cta"
          >
            Спробувати без облікового запису
          </button>
        </section>

        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          aria-label="Чому Sergeant"
        >
          {FEATURES.map((feature, idx) => (
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
          className="rounded-3xl border border-line bg-panel p-6 sm:p-8 text-center space-y-3"
          aria-label="Перехід до тарифів"
        >
          <h2 className="text-style-hero text-text">Подивись на тарифи</h2>
          <p className="text-sm text-muted max-w-xl mx-auto">
            Free назавжди для повсякденного використання. Pro відкриває
            безлімітний AI-чат, авто-Mono sync і CloudSync між пристроями.
          </p>
          <div className="pt-2 flex items-center justify-center">
            <Button
              variant="secondary"
              size="md"
              onClick={goToPricing}
              data-testid="landing-pricing-link"
            >
              Дивитись тарифи
              <Icon name="chevron-right" size={16} className="ml-1" />
            </Button>
          </div>
        </section>

        <footer className="text-center text-xs text-muted space-y-1">
          <p>
            Sergeant — український проєкт. Без реклами, без перепродажу даних,
            без темних патернів. Telegram-канал з оновленнями і публічний
            changelog у репозиторії.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default LandingPage;
