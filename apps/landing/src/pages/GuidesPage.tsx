import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * Реєстр гайдів. Один запис – один файл сторінки; нові гайди додаються
 * сюди і в роутер App.tsx.
 */
const GUIDES = [
  {
    href: "/guides/cheky",
    category: "Фінанси",
    title:
      "Як перетворити паперовий чек на облік витрат, коли QR не сканується",
    teaser:
      "Чому QR-код на фіскальному чеку зараз веде в нікуди, що чек знає понад банківську виписку і як його сфотографувати з першого разу.",
  },
  {
    href: "/guides/kbzhu",
    category: "Харчування",
    title: "Як рахувати КБЖУ, коли в базі немає українських продуктів",
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. Плюс чесна відповідь, скільки похибки можна собі дозволити.",
  },
  {
    href: "/guides/monobank",
    category: "Фінанси",
    title: "Як підʼєднати Monobank до трекера витрат – і що він реально бачить",
    teaser:
      "Персональний токен за хвилину, таблиця «бачить / не може» і як усе відкликати одним кліком.",
  },
];

export default function GuidesPage() {
  usePageMeta(ROUTE_META["/guides"]);

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
          Гайди
        </h1>
        <p className="mt-5 max-w-xl leading-relaxed text-muted">
          Розбори про гроші, звички і трекінг. Коротка відповідь стоїть одразу
          на початку.
        </p>

        <div className="mt-10 border-b border-cardline">
          {GUIDES.map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block border-t border-cardline py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
                {guide.category}
              </p>
              <h2 className="mt-2 max-w-2xl text-xl font-bold leading-snug text-balance text-foreground-strong group-hover:underline sm:text-2xl">
                {guide.title}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                {guide.teaser}
              </p>
            </a>
          ))}
        </div>

        <p className="mt-8 text-sm text-subtle">
          Нові гайди зʼявляються в міру того, як я їх пишу. Анонси – у Threads і
          Telegram.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
