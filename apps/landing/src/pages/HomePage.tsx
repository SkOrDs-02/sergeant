import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import WaitlistForm from "../components/WaitlistForm";
import DashboardPreview from "../components/DashboardPreview";
import { HowItWorks, ModulesSection, BetaCta } from "../components/HomeSections";

export default function HomePage() {
  return (
    <>
      <div className="border-b border-cardline bg-card px-4 py-2 text-center text-xs text-muted backdrop-blur-md sm:text-sm">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
          />
          Закрита бета · 412 / 500 місць зайнято
        </span>
      </div>

      <SiteHeader />

      <main>
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-4 pt-14 text-center sm:px-8 sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-cardline bg-card px-4 py-1.5 text-xs text-muted backdrop-blur-md sm:text-sm">
            <b className="text-accent">Local-first</b> · AI · Українською
          </span>
          <h1 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Одне життя.
            <br />
            Один <span className="text-accent">застосунок.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            Гроші, тренування, звички та їжа — в одному дашборді. AI-сержант
            зʼєднує все, бачить твій день і тримає тебе в тонусі. Дані живуть
            на твоєму пристрої.
          </p>
          <div className="mt-8 flex w-full justify-center">
            <WaitlistForm buttonLabel="Хочу в бету" />
          </div>
          <p className="mt-3 text-xs text-muted">
            Безкоштовно · 7-денний Pro-тріал без картки · без спаму
          </p>
        </section>

        <DashboardPreview />
        <HowItWorks />
        <ModulesSection />
        <BetaCta />
      </main>

      <SiteFooter />
    </>
  );
}
