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
import { CONFIDENCE } from "../content/confidenceLevels";
import { THREADS_URL, TELEGRAM_BOT_URL } from "../lib/links";
import { ORGANIZATION_ID } from "../lib/jsonLd";

/**
 * Hero-колаж: два справжні кадри застосунку (Огляд Фініка й Огляд Рутини) у
 * рамках телефонів і нотатка-інсайт, яку Sergeant ніби лишив поверх них.
 * Кадри знімає `apps/web/tests/__shots__/landing.spec.ts` зі світу
 * `landing-world`, тож hero не малює UI, якого в продукті немає. Дані в
 * нотатці ілюстративні (підпис каже про це); рівень впевненості береться з
 * канонічної шкали (`CONFIDENCE`). До lg – два кадри в ряд і нотатка під
 * ними, на lg – absolute-розкладка з легкими нахилами.
 */
const HERO_NOTE = "У тижні з трьома тренуваннями витрати на доставку нижчі";
const HERO_META = `${CONFIDENCE.stable} · 6 тижнів даних`;

function PhoneFrame({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={390}
      height={844}
      className={`paper-shadow block rounded-[28px] border-[5px] border-ink bg-ink ${className}`}
    />
  );
}

function HeroCollage() {
  return (
    <div className="relative mx-auto mt-4 flex w-full max-w-md flex-col gap-5 lg:mt-0 lg:h-[600px] lg:w-[480px] lg:max-w-none lg:shrink-0">
      <div className="flex items-start justify-center gap-4 lg:contents">
        <PhoneFrame
          src="/screens/hero-finyk.webp"
          alt="Огляд Фініка: скільки ще можна витратити сьогодні, план місяця і останні витрати"
          className="w-[46%] -rotate-2 lg:absolute lg:left-0 lg:top-0 lg:w-[226px]"
        />
        <PhoneFrame
          src="/screens/hero-routine.webp"
          alt="Огляд Рутини: сьогоднішні звички, усі пʼять виконано, найкраща серія 30 днів"
          className="mt-6 w-[46%] rotate-2 lg:absolute lg:right-0 lg:top-12 lg:mt-0 lg:w-[226px]"
        />
      </div>

      <figure className="paper-shadow-lg relative z-10 flex rotate-[1.5deg] flex-col gap-2.5 rounded-[var(--radius-card)] bg-note px-7 py-6 lg:absolute lg:bottom-0 lg:left-3 lg:min-h-[120px] lg:w-[400px]">
        <blockquote className="text-lg font-medium leading-normal text-foreground sm:text-xl">
          «{HERO_NOTE}»
        </blockquote>
        <figcaption className="text-xs text-subtle">
          ілюстративний приклад · записав Сержант · {HERO_META}
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
    // Вузол, який читає модель, коли її питають «що це за продукт». Тримай
    // його багатшим за назву й ціну: без description і featureList відповідь
    // спирається лише на applicationCategory. url і logo – відносні, бо домен
    // знає лише білд (див. lib/jsonLd.ts).
    //
    // `WebSite` поруч: з нього Google бере назву сайту у видачі, а без нього
    // показує домен (аудит сайту 2026-10-08, S9). `@id` організації
    // дописує `enrichJsonLd` (lib/jsonLd.ts), той самий, що на всіх сторінках.
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "/#website",
          name: "Sergeant",
          url: "/",
          inLanguage: "uk",
          publisher: { "@id": ORGANIZATION_ID },
        },
        {
          "@type": "SoftwareApplication",
          name: "Sergeant",
          url: "/",
          inLanguage: "uk",
          applicationCategory: "LifestyleApplication",
          // Лише веб: мобільний застосунок існує, але його публічний вихід
          // відкладено (рішення §10.1 спеки site-ia), а схему читають без контексту.
          operatingSystem: "Web",
          description: ROUTE_META["/"].description,
          featureList: [
            "Гроші: витрати з Monobank, фото чека, виписки файлом або вручну",
            "Тіло: щоденник тренувань, тоннаж і рекорди",
            "Звички: серія, яку не обнуляє пропуск із причиною",
            "Їжа: КБЖВ зі штрихкоду, фото страви та української бази продуктів",
            "Звʼязки між сферами, підписані рівнем впевненості",
          ],
          offers: { "@type": "Offer", price: 0, priceCurrency: "UAH" },
          publisher: {
            "@type": "Organization",
            name: "Sergeant",
            url: "/",
            logo: "/apple-touch-icon.png",
            // Єдиний публічний профіль поза сайтом. Без sameAs модель бачить
            // організацію лише за назвою, і «хто це робить» лишається без опори.
            sameAs: [THREADS_URL],
            // Канал звʼязку машинним текстом: агент, що зважує «кому писати»,
            // інакше не має жодної адреси, крім кнопки в футері. Пошти й
            // телефону тут немає навмисно — їх у продукту публічно немає, а
            // вигадані реквізити читає саме той, хто перевіряє легітимність.
            contactPoint: [
              {
                "@type": "ContactPoint",
                contactType: "customer support",
                url: TELEGRAM_BOT_URL,
                availableLanguage: ["uk"],
                areaServed: "UA",
              },
            ],
          },
        },
      ],
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
            Гроші, тренування, звички і їжа в одному приватному застосунку. Він
            порівнює твої записи й помічає звʼязки між сферами, коли даних
            вистачає. Рахує, а не читає лекцій.
          </p>
          <div className="flex flex-col gap-2.5">
            <TelegramCta placement="hero" label="Стати в чергу" />
            <p className="text-sm text-subtle">
              безкоштовно назавжди: чотири модулі й{" "}
              <a
                href="/pomichnyk#limity"
                className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                20 запитів до Сержанта щотижня
              </a>{" "}
              · дані твої,{" "}
              <a
                href="/vyhid"
                className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                забрати можна будь-коли
              </a>
            </p>
          </div>
        </div>

        <HeroCollage />
      </section>

      <ModulesSection />
      <ConnectionsSection />

      <FounderSection />
      <StatusBridge />
      <ClosingCta />
    </SiteLayout>
  );
}
