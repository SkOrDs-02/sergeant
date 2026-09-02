import { useState } from "react";
import SiteLayout from "../components/SiteLayout";
import TelegramCta from "../components/TelegramCta";
import {
  ModulesSection,
  ConnectionsSection,
  FounderSection,
  StatusBridge,
  ClosingCta,
} from "../components/HomeSections";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "../lib/analytics";
import { CONFIDENCE } from "../content/confidenceLevels";

/**
 * Сценарії «живого звʼязку» в hero: скільки тренувань – стільки доставки.
 * Дані ілюстративні (підпис у нотатці про це каже) – сенс віджета в тому,
 * щоб показати причину-наслідок, а не конкретні числа. Рівень впевненості
 * один на всі три стани: це та сама закономірність, а не три різні, і
 * підпис береться з канонічної шкали (`CONFIDENCE`), а не вигадується.
 */
const HERO_SCENARIOS = {
  1: {
    spend: "2 260",
    pct: 90,
    note: "У тижні з одним тренуванням доставки найбільше",
  },
  3: {
    spend: "1 840",
    pct: 74,
    note: "Три тренування, і замовлень доставки вже менше",
  },
  5: {
    spend: "1 320",
    pct: 53,
    note: "Пʼять тренувань, і доставка падає майже вдвічі",
  },
} as const;

const HERO_META = `${CONFIDENCE.stable} · 6 тижнів даних`;

type HeroTrainings = keyof typeof HERO_SCENARIOS;

/**
 * Hero-колаж: картки даних, «розкидані на столі», і нотатка-інсайт, яку
 * Sergeant ніби лишив поверх них. Картка тренувань – живий перемикач:
 * 1/3/5 тренувань перераховують бар доставки і саму нотатку, показуючи
 * причину-наслідок замість статичної картинки. До lg – звичайна колонка
 * з легкими нахилами, на lg – absolute-розкладка з пунктирними звʼязками.
 */
function HeroCollage() {
  const [trainings, setTrainings] = useState<HeroTrainings>(3);
  const scenario = HERO_SCENARIOS[trainings];

  return (
    <div className="relative mx-auto mt-4 flex w-full max-w-md flex-col gap-5 lg:mt-0 lg:h-[430px] lg:w-[480px] lg:max-w-none lg:shrink-0">
      <svg
        width="480"
        height="430"
        viewBox="0 0 480 430"
        fill="none"
        aria-hidden="true"
        className="absolute left-0 top-0 hidden lg:block"
      >
        <path
          d="M190,150 C 180,210 175,240 185,280"
          className="stroke-cardline-strong"
          strokeWidth="1.6"
          strokeDasharray="5 6"
        />
        <path
          d="M390,205 C 400,240 380,270 340,290"
          className="stroke-cardline-strong"
          strokeWidth="1.6"
          strokeDasharray="5 6"
        />
      </svg>

      <div className="paper-shadow flex -rotate-3 flex-col gap-2.5 rounded-[var(--radius-card)] bg-card p-5 lg:absolute lg:left-10 lg:top-4 lg:w-[290px]">
        <div className="flex justify-between text-[13px]">
          <span className="font-bold text-foreground">Кафе і доставка</span>
          <span className="tabular-nums text-muted">
            {scenario.spend}&nbsp;/ 2&nbsp;500&#8239;₴
          </span>
        </div>
        <div className="h-1.5 bg-finyk-soft">
          <div
            className="h-1.5 bg-finyk transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${scenario.pct}%` }}
          />
        </div>
        <p className="text-xs text-subtle">Фінік · синк із Monobank</p>
      </div>

      <div
        role="group"
        aria-label="Тренувань цього тижня"
        className="paper-shadow flex rotate-2 flex-col gap-2 rounded-[var(--radius-card)] bg-card p-4.5 lg:absolute lg:right-0 lg:top-[104px] lg:w-[210px]"
      >
        <span className="text-[13px] font-bold text-foreground">
          Тренування
        </span>
        <div className="flex gap-2">
          {([1, 3, 5] as const).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={n === trainings}
              onClick={() => {
                setTrainings(n);
                track(ANALYTICS_EVENTS.LANDING_WIDGET_CHANGED, {
                  trainings: n,
                  locale: LANDING_LOCALE,
                });
              }}
              className={`flex h-11 w-11 items-center justify-center border-2 border-foreground-strong font-display text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                n === trainings
                  ? "bg-foreground-strong text-background"
                  : "bg-background text-foreground-strong hover:bg-cardline"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">цього тижня · натисни цифру</span>
      </div>

      <figure className="paper-shadow-lg flex rotate-[1.5deg] flex-col gap-2.5 rounded-[var(--radius-card)] bg-note px-7 py-6 lg:absolute lg:left-3 lg:top-[268px] lg:min-h-[120px] lg:w-[400px]">
        <blockquote className="text-lg font-medium leading-normal text-foreground sm:text-xl">
          «{scenario.note}»
        </blockquote>
        <figcaption className="text-xs text-subtle">
          записав Sergeant · {HERO_META} · ілюстративний приклад
        </figcaption>
      </figure>
    </div>
  );
}

export default function HomePage() {
  usePageMeta({
    ...ROUTE_META["/"],
    // Головна після переїзду секцій – пітч продукту. FAQPage поїхав на
    // /pytannya разом із питаннями: розмітка без видимого контенту не тримається.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Sergeant",
      inLanguage: "uk",
      applicationCategory: "LifestyleApplication",
      // Лише веб: мобільний застосунок існує, але його публічний вихід
      // відкладено (рішення §10.1 спеки site-ia), а схему читають без контексту.
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: 0, priceCurrency: "UAH" },
    },
  });

  return (
    <SiteLayout>
      <section className="mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 className="font-display text-[44px] font-extrabold uppercase leading-[1.05] tracking-tight text-foreground-strong sm:text-6xl lg:text-[62px]">
            Порядок
            <br />
            без крику
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-pretty text-muted">
            Sergeant – приватний застосунок, що тримає гроші, тренування, звички
            і їжу разом і показує, як вони тягнуть одне одного. Сержант на
            твоєму боці: рахує, а не читає лекцій.
          </p>
          <div className="flex flex-col gap-2.5">
            <TelegramCta placement="hero" label="Стати в чергу" />
            <p className="text-sm text-subtle">
              черга живе в Telegram · ядро безкоштовне назавжди
            </p>
          </div>
        </div>

        <HeroCollage />
      </section>

      <ModulesSection />
      <ConnectionsSection />

      <section className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 pb-16 sm:px-8">
        <a
          href="/beta"
          className="inline-flex min-h-12 items-center bg-foreground-strong px-8 py-4 font-display text-sm font-bold uppercase tracking-[0.08em] text-background transition hover:bg-ink-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Стати в чергу
        </a>
        <p className="text-sm text-subtle">
          черга живе в Telegram · одне повідомлення, коли відкриється твоя хвиля
        </p>
      </section>

      <FounderSection />
      <StatusBridge />
      <ClosingCta />
    </SiteLayout>
  );
}
