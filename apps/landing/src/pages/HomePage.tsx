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
        {/*
          Герой вирівняний вліво по тій самій осі, що й картки дашборда під
          ним. Центрований блок над суцільно лівими секціями був не рішенням,
          а звичкою — і саме він разом із крапко-роздільною «пігулкою» робив
          сторінку схожою на шаблон.
        */}
        <section className="hero-wash">
          <div className="mx-auto w-full max-w-5xl px-5 pb-6 pt-16 sm:px-8 sm:pt-24">
            <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.04] tracking-tight text-balance text-foreground-strong sm:text-6xl lg:text-[4.25rem]">
              Бачить усе твоє життя <span className="text-accent">разом</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
              Гроші, тіло, звички та їжа — в одному застосунку. Sergeant помічає
              звʼязки, яких поодинокі трекери не бачать: як пізні ночі бʼють по
              бюджету, а тренування — по настрою.
            </p>

            <div className="mt-9">
              <TelegramCta placement="hero" />
            </div>

            {/* Один кластер дрібного тексту, а не два стеки поспіль: три
                визначальні риси продукту й чесний рядок про те, що буде
                після кліку. Пігулка з крапками-роздільниками звідси прибрана
                — вона нічого не додавала, крім упізнаваного вигляду
                згенерованого лендінга. */}
            <div className="mt-7 max-w-md border-l-2 border-cardline pl-4">
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-foreground">
                <span className="font-semibold text-accent">Local-first</span>
                <span aria-hidden="true" className="text-subtle">
                  /
                </span>
                <span>AI-помічник</span>
                <span aria-hidden="true" className="text-subtle">
                  /
                </span>
                <span>українською</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-subtle">
                Бот запише тебе в список і напише, коли відкриємо доступ. Вийти
                — командою /stop. Рахуємо лише знеособлені перегляди сторінки.
              </p>
            </div>
          </div>

          <DashboardPreview />
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
