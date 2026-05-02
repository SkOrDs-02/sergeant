import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { ANALYTICS_EVENTS, trackEvent } from "./observability/analytics";
import { WaitlistForm } from "./pricing/WaitlistForm";

/**
 * Phase 0 monetization rails: статична маркетингова сторінка з планом
 * тарифів і CTA-формою waitlist-у. Активного білінгу ще немає — задача
 * сторінки виміряти попит до того, як вкладатись у Stripe / Mono jar.
 *
 * План тарифів змавпований із `docs/launch/01-monetization-and-pricing.md`
 * (варіант Б — три тіри з decoy ефектом). Ціни тут — pre-MVP draft, не
 * біллимо нікого.
 */

interface Tier {
  id: "free" | "plus" | "pro";
  name: string;
  price: string;
  cadence: string;
  highlight?: boolean;
  tagline: string;
  features: ReadonlyArray<string>;
}

const TIERS: ReadonlyArray<Tier> = [
  {
    id: "free",
    name: "Free",
    price: "₴0",
    cadence: "назавжди",
    tagline: "Усі 4 модулі базово. Local-first, без cloud.",
    features: [
      "Усі модулі: Фінік / Фізрук / Харчування / Звички",
      "AI-чат: 5 повідомлень на день",
      "Manual Mono-імпорт (без webhook)",
      "1 активна програма у Фізруку",
      "2 push-нагадування для звичок",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    price: "₴59",
    cadence: "на місяць",
    tagline: "Якщо AI треба більше і кілька пристроїв.",
    features: [
      "AI-чат: 25 повідомлень на день",
      "AI-фото для їжі: 10 на день",
      "CloudSync на 2 пристрої",
      "Тижневі крос-модульні звіти",
      "Авто-Mono sync",
      "3 активні програми у Фізруку",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "₴99",
    cadence: "на місяць (₴799/рік)",
    highlight: true,
    tagline: "Усе без обмежень + щоденний AI-брифінг.",
    features: [
      "Безлімітний AI-чат + щоденний брифінг",
      "Безлімітне AI-фото для їжі",
      "CloudSync на всі пристрої",
      "Повні звіти + порівняння модулів",
      "Авто-Mono + мульти-банк (PrivatBank)",
      "Безлімітні програми + push-нагадування",
      "Експорт CSV / PDF + кастомні теми",
    ],
  },
];

export function PricingPage() {
  const navigate = useNavigate();

  // Pageview-аналітика. Window.location.search парситься щоб ми могли
  // розрізнити "user натиснув CTA з paywall" vs "user сам зайшов на /pricing".
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = params.get("source") ?? "direct";
    trackEvent(ANALYTICS_EVENTS.PRICING_VIEWED, { source });
  }, []);

  function handleTierCta(tierId: Tier["id"]): void {
    trackEvent(ANALYTICS_EVENTS.PRICING_CTA_CLICKED, {
      tier: tierId,
      cta: "waitlist",
    });
    // Скрол до форми. Без `behavior: "smooth"` на `prefers-reduced-motion`
    // користувачах — браузер сам ріспектить media query. Захищаємось
    // `typeof === "function"` бо jsdom не реалізує `scrollIntoView`,
    // а в продакшні старі браузери теж можуть його не мати.
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
          <h1 className="text-xl font-bold text-text">Тарифи</h1>
        </header>

        <section className="space-y-3 text-center">
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional marketing eyebrow above the hero headline; не існує SectionHeading-eyebrow API. */}
          <p className="text-xs uppercase tracking-wider text-brand-strong font-semibold">
            Pre-MVP — поки збираємо інтерес
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-text leading-tight">
            Sergeant буде безкоштовним для більшості.
            <br />
            Pro — для тих, хто хоче усе одразу.
          </h2>
          <p className="text-base text-muted max-w-2xl mx-auto">
            Білінг ще не запущено. Залиш email — повідомимо щойно Pro стартує, і
            ціни вже фіналізуємо. Жодних авто-списань зараз.
          </p>
        </section>

        <section
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          aria-label="Тарифні плани"
        >
          {TIERS.map((tier, idx) => (
            <article
              key={tier.id}
              className={cn(
                "rounded-3xl border p-6 flex flex-col gap-4",
                "transition-all duration-300 ease-out",
                "[@media(pointer:fine)]:hover:shadow-float [@media(pointer:fine)]:hover:-translate-y-1",
                "motion-safe:animate-stagger-in",
                tier.highlight
                  ? "border-brand-500 bg-panel shadow-glow"
                  : "border-line bg-panel [@media(pointer:fine)]:hover:border-brand-200/50",
              )}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <header className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-text">{tier.name}</h3>
                  {tier.highlight && (
                    // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- pill-badge на картці тіра; uppercase + tracking — частина дизайну badge-а.
                    <span className="text-xs font-semibold uppercase tracking-wider text-brand-strong bg-brand/10 px-2 py-1 rounded-full">
                      Топ-вибір
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">{tier.tagline}</p>
              </header>

              <div className="space-y-1">
                <span className="text-3xl font-bold text-text">
                  {tier.price}
                </span>
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
              >
                {tier.id === "free"
                  ? "Лишусь на Free"
                  : "Хочу дізнатись першим"}
              </Button>
            </article>
          ))}
        </section>

        <section
          id="waitlist-anchor"
          className="rounded-3xl border border-line bg-panel p-6 sm:p-8 max-w-2xl mx-auto"
        >
          <header className="space-y-2 mb-6">
            <h2 className="text-2xl font-bold text-text">
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
            Усі ціни орієнтовні (₴, для України). Після MVP можемо додати $/€
            для міжнародної аудиторії.
          </p>
          <p>
            Деталі плану:{" "}
            <code className="bg-panelHi px-1.5 py-0.5 rounded text-text">
              docs/launch/01-monetization-and-pricing.md
            </code>
          </p>
        </footer>
      </div>
    </div>
  );
}
