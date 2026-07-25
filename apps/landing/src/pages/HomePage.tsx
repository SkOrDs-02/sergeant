import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import WaitlistForm from "../components/WaitlistForm";
import DashboardPreview from "../components/DashboardPreview";
import {
  HowItWorks,
  ModulesSection,
  HonestSection,
  BetaCta,
} from "../components/HomeSections";

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="hero-wash">
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-5 pb-6 pt-16 text-center sm:px-8 sm:pt-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-cardline bg-card px-4 py-1.5 text-xs text-muted sm:text-sm">
              <b className="font-semibold text-accent">Local-first</b>
              <span aria-hidden="true">·</span> AI-помічник{" "}
              <span aria-hidden="true">·</span> українською
            </span>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.06] tracking-tight text-balance text-foreground-strong sm:text-6xl lg:text-[4.25rem]">
              Бачить усе твоє життя{" "}
              <span className="text-accent">разом</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-pretty text-muted">
              Гроші, тіло, звички та їжа — в одному застосунку. Sergeant
              помічає звʼязки, яких поодинокі трекери не бачать: як пізні ночі
              бʼють по бюджету, а тренування — по настрою.
            </p>
            <div className="mt-8 flex w-full justify-center">
              <WaitlistForm buttonLabel="Приєднатись до бети" />
            </div>
            <p className="mt-3 text-xs text-muted">
              Ще збираємо ранніх користувачів. Без спаму — напишемо, коли
              відкриємо доступ.
            </p>
          </div>

          <DashboardPreview />
        </section>

        <HowItWorks />
        <ModulesSection />
        <HonestSection />
        <BetaCta />
      </main>

      <SiteFooter />
    </>
  );
}
