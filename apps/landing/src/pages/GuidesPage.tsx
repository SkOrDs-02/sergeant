import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";

/**
 * Реєстр гайдів. Один запис – один файл сторінки; нові гайди додаються
 * сюди і в роутер App.tsx. Назва картки береться з `routeMeta.title`: до
 * 2026-09-15 каталог тримав власні формулювання, і той самий гайд мав три
 * імені в трьох місцях (мета, каталог, llms.txt).
 */
const GUIDES: {
  href: keyof typeof ROUTE_META;
  module: { href: string; label: string };
  teaser: string;
}[] = [
  {
    href: "/guides/bank-bezpeka",
    module: { href: "/data", label: "Твої дані" },
    teaser:
      "Сім питань, які варто поставити будь-якому фінансовому сервісу до того, як дати йому доступ. Відповідь Sergeant стоїть одразу під кожним.",
  },
  {
    href: "/guides/foto-kalorii",
    module: { href: "/yizha", label: "Їжа" },
    teaser:
      "Що фото справді впізнає, а де починає вгадувати, і як Sergeant закриває сліпі місця уточнюючими питаннями. Плюс ієрархія точності від штрихкоду до ока.",
  },
  {
    href: "/guides/cheky",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Чому QR-код на фіскальному чеку зараз веде в нікуди, що чек знає понад банківську виписку і як його сфотографувати з першого разу.",
  },
  {
    href: "/guides/kbzhv",
    module: { href: "/yizha", label: "Їжа" },
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. Плюс скільки похибки можна собі дозволити.",
  },
  {
    href: "/guides/pauza-i-propusk",
    module: { href: "/zvychky", label: "Звички" },
    teaser:
      "Три різні механізми мʼякості: пауза датами, причина пропуску і заморозка, яку серія заробляє сама. Кроки для кожного.",
  },
  {
    href: "/guides/ohlyad-dnya",
    module: { href: "/zvychky", label: "Звички" },
    teaser:
      "Календар Рутини показує не лише звички. Що саме туди підтягується з інших модулів і де межі цього перегляду.",
  },
  {
    href: "/guides/zamist-chotyryokh-trekeriv",
    module: { href: "/zvyazky", label: "Звʼязки" },
    teaser:
      "Що саме він замінює, що переноситься зі старих застосунків (виписки і Strong), що ні (Apple Health, чужі звички та їжа), і коли окремі трекери будуть кращими.",
  },
  {
    href: "/guides/tyzhnevyi-pidsumok",
    module: { href: "/zvyazky", label: "Звʼязки" },
    teaser:
      "Збирається автоматично в понеділок за тиждень, що завершився. Тому у вівторок «цього тижня» там ще немає.",
  },
  {
    href: "/guides/kilka-bankiv",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Автосинхронізація є лише з Monobank. Решта карт заводиться випискою файлом раз на місяць, і все опиняється в одній стрічці.",
  },
  {
    href: "/guides/pryvat24",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Прямого підключення до Привату поки немає. Виписка файлом Excel або CSV, підказка категорії з колонки банку і перевірка дублів до збереження.",
  },
  {
    href: "/guides/silpo",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Звʼязаний акаунт приносить чеки по позиціях. Одна сума ділиться за реальними категоріями, а продукти йдуть у комору Харчування.",
  },
  {
    href: "/guides/monobank",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Персональний токен за хвилину, таблиця «бачить / не може» і як усе відкликати одним кліком.",
  },
];

/**
 * Порядок груп той самий, що в шапці сайту: гайд шукають через модуль, з
 * якого прийшли. При девʼятьох гайдах плоский список читався як безлад –
 * фінансові стояли на позиціях 1, 3, 8 і 9 просто тому, що в такому
 * порядку дописувались.
 */
const GROUPS = [
  { href: "/hroshi", label: "Гроші" },
  { href: "/yizha", label: "Їжа" },
  { href: "/zvychky", label: "Звички" },
  { href: "/zvyazky", label: "Звʼязки" },
  { href: "/data", label: "Твої дані" },
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
        name: ROUTE_META[guide.href].title,
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

      {GROUPS.map((group) => {
        const inGroup = GUIDES.filter((g) => g.module.href === group.href);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.href} className="mt-12">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.12em] text-subtle">
              <a
                href={group.href}
                className="transition hover:text-foreground-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {group.label}
              </a>
            </h2>
            <div className="mt-3 border-b border-cardline">
              {inGroup.map((guide) => (
                <a
                  key={guide.href}
                  href={guide.href}
                  className="group block border-t border-cardline py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  <h3 className="max-w-2xl text-xl font-bold leading-snug text-balance text-foreground-strong group-hover:underline sm:text-2xl">
                    {ROUTE_META[guide.href].title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                    {guide.teaser}
                  </p>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-8 text-sm text-subtle">
        Нові гайди зʼявляються, щойно я їх дописую. Анонси – у Threads і
        Telegram.
      </p>
    </SiteLayout>
  );
}
