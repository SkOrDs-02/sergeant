import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import TelegramCta from "../components/TelegramCta";
import InsightChart from "../components/InsightChart";
import {
  ModulesSection,
  TrustSection,
  ConnectionsSection,
  HonestSection,
  FaqSection,
  ClosingCta,
  FAQ_ITEMS,
} from "../components/HomeSections";
import { usePageMeta } from "../lib/pageMeta";

export default function HomePage() {
  usePageMeta({
    title: "Sergeant: бачить звʼязки між усім, що важливо",
    description:
      "Гроші, тіло, звички й харчування в одному приватному просторі. Sergeant помічає звʼязки, які губляться в окремих трекерах.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  });

  return (
    <>
      <SiteHeader />

      <main>
        <section className="hero-wash">
          <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
            <div className="max-w-2xl">
              <h1 className="font-display text-4xl font-bold leading-[1.04] tracking-tight text-balance text-foreground-strong sm:text-5xl lg:text-[3.25rem]">
                Бачить звʼязки між усім, що важливо
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted">
                Гроші, тіло, звички й харчування в одному приватному просторі.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5">
                <TelegramCta placement="hero" label="Стати в чергу" />
                <a
                  href="#data"
                  className="text-sm text-muted underline decoration-cardline-strong underline-offset-4 transition hover:text-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  Твої дані залишаються твоїми
                </a>
              </div>
            </div>

            <div className="mt-14 grid items-center gap-8 border-t border-cardline pt-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-12">
              <InsightChart />
              <div>
                <p className="max-w-md font-semibold leading-normal text-foreground-strong">
                  У тижні, коли тренувань більше, замовлень доставки зазвичай
                  менше.
                </p>
                <p className="mt-1.5 text-xs text-subtle">
                  Приклад спостереження · Sergeant показує таке, лише коли
                  впевнений
                </p>
              </div>
            </div>
          </div>
        </section>

        <ModulesSection />
        <TrustSection />
        <ConnectionsSection />
        <HonestSection />
        <FaqSection />
        <ClosingCta />
      </main>

      <SiteFooter />
    </>
  );
}
