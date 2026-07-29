import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import TelegramCta from "../components/TelegramCta";
import DashboardPreview from "../components/DashboardPreview";
import {
  HowItWorks,
  ModulesSection,
  ConnectionsSection,
  HonestSection,
  BetaCta,
} from "../components/HomeSections";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="hero-wash">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14 lg:py-20">
            <div className="max-w-xl">
              <h1 className="font-display text-4xl font-bold leading-[1.04] tracking-tight text-balance text-foreground-strong sm:text-5xl lg:text-[3.25rem]">
                Бачить звʼязки між усім, що важливо
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-muted">
                Гроші, тіло, звички й харчування в одному приватному просторі.
              </p>

              <div className="mt-8">
                <TelegramCta placement="hero" label="Приєднатися до бети" />
              </div>

              <p className="mt-5 max-w-sm text-sm leading-relaxed text-subtle">
                Твої дані залишаються твоїми.
              </p>
            </div>

            <DashboardPreview />
          </div>
        </section>

        <HowItWorks />
        <ModulesSection />
        <ConnectionsSection />
        <HonestSection />
        <BetaCta />
      </main>

      <SiteFooter />
    </>
  );
}
