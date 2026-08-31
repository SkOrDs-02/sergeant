import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * Реєстр гайдів. Один запис – один файл сторінки; нові гайди додаються
 * сюди і в роутер App.tsx.
 */
const GUIDES = [
  {
    href: "/guides/bank-bezpeka",
    module: { href: "/data", label: "Твої дані" },
    category: "Фінанси",
    title:
      "Чи безпечно давати застосунку доступ до банку: що перевірити перед підключенням",
    teaser:
      "Сім питань, які варто поставити будь-якому фінансовому сервісу до того, як дати йому доступ. Відповідь Sergeant стоїть одразу під кожним.",
  },
  {
    href: "/guides/foto-kalorii",
    module: { href: "/yizha", label: "Їжа" },
    category: "Харчування",
    title: "Чи можна порахувати калорії страви з фото – і наскільки це точно",
    teaser:
      "Що фото справді впізнає, а де починає вгадувати, і як Sergeant закриває сліпі місця уточнюючими питаннями. Плюс ієрархія точності від штрихкоду до ока.",
  },
  {
    href: "/guides/cheky",
    module: { href: "/hroshi", label: "Гроші" },
    category: "Фінанси",
    title:
      "Як перетворити паперовий чек на облік витрат, коли QR не сканується",
    teaser:
      "Чому QR-код на фіскальному чеку зараз веде в нікуди, що чек знає понад банківську виписку і як його сфотографувати з першого разу.",
  },
  {
    href: "/guides/kbzhv",
    module: { href: "/yizha", label: "Їжа" },
    category: "Харчування",
    title: "Як рахувати КБЖВ, коли в базі немає українських продуктів",
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. Плюс чесна відповідь, скільки похибки можна собі дозволити.",
  },
  {
    href: "/guides/pauza-i-propusk",
    module: { href: "/zvychky", label: "Звички" },
    category: "Звички",
    title: "Як заявити паузу і пояснити пропуск, щоб серія не обнулилась",
    teaser:
      "Три різні механізми мʼякості: пауза датами, причина пропуску і заморозка, яку серія заробляє сама. Кроки для кожного.",
  },
  {
    href: "/guides/ohlyad-dnya",
    module: { href: "/zvychky", label: "Звички" },
    category: "Звички",
    title: "Як бачити тренування і планові платежі поруч зі звичками",
    teaser:
      "Календар Рутини показує не лише звички. Що саме туди підтягується з інших модулів і де межі цього перегляду.",
  },
  {
    href: "/guides/tyzhnevyi-pidsumok",
    module: { href: "/zvyazky", label: "Звʼязки" },
    category: "Звʼязки",
    title: "Коли приходить тижневий підсумок і як отримати його раніше",
    teaser:
      "Збирається автоматично в понеділок за тиждень, що завершився. Тому у вівторок «цього тижня» там ще немає.",
  },
  {
    href: "/guides/kilka-bankiv",
    module: { href: "/hroshi", label: "Гроші" },
    category: "Фінанси",
    title: "Як звести витрати докупи, якщо карти в кількох банках",
    teaser:
      "Автосинк є лише з Monobank. Решта карт заводиться випискою файлом раз на місяць, і все опиняється в одній стрічці.",
  },
  {
    href: "/guides/monobank",
    module: { href: "/hroshi", label: "Гроші" },
    category: "Фінанси",
    title: "Як підʼєднати Monobank до трекера витрат – і що він реально бачить",
    teaser:
      "Персональний токен за хвилину, таблиця «бачить / не може» і як усе відкликати одним кліком.",
  },
];

export default function GuidesPage() {
  usePageMeta({
    ...ROUTE_META["/guides"],
    // Каталог – це перелік, а не наратив: ItemList віддає краулеру склад
    // хабу машинно, без переписування самих карток.
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Гайди Sergeant",
      inLanguage: "uk",
      numberOfItems: GUIDES.length,
      itemListElement: GUIDES.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: guide.title,
        url: guide.href,
      })),
    },
  });

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Гайди
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        Розбори про гроші, звички і трекінг. Коротка відповідь стоїть одразу на
        початку.
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
            <p className="mt-2 text-xs text-subtle">
              Рідний модуль: {guide.module.label}
            </p>
          </a>
        ))}
      </div>

      <p className="mt-8 text-sm text-subtle">
        Нові гайди зʼявляються, щойно я їх дописую. Анонси – у Threads і
        Telegram.
      </p>
    </SiteLayout>
  );
}
