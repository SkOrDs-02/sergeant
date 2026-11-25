import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { TELEGRAM_BOT_URL, THREADS_URL } from "../lib/links";

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
      "Сім питань до будь-якого фінансового сервісу, перш ніж дати йому доступ, і відповідь Sergeant на кожне.",
  },
  {
    href: "/guides/foto-kalorii",
    module: { href: "/yizha", label: "Їжа" },
    teaser:
      "Що фото впізнає, де починає вгадувати і що Сержант уточнює питаннями. Точність способів від штрихкоду до ока.",
  },
  {
    href: "/guides/cheky",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Чому QR-код на фіскальному чеку зараз нікуди не веде, що чек знає понад виписку і як сфотографувати його з першого разу.",
  },
  {
    href: "/guides/kbzhv",
    module: { href: "/yizha", label: "Їжа" },
    teaser:
      "Штрихкод, українська база і рецепти замість щоденного перебирання інгредієнтів. І яка похибка припустима.",
  },
  {
    href: "/guides/pauza-i-propusk",
    module: { href: "/zvychky", label: "Звички" },
    teaser:
      "Три способи зберегти серію: пауза на дати, причина пропуску і заморозка, яку серія заробляє сама.",
  },
  {
    href: "/guides/ohlyad-dnya",
    module: { href: "/zvychky", label: "Звички" },
    teaser:
      "Що календар Рутини підтягує з інших модулів, крім звичок, і чого там немає.",
  },
  {
    href: "/guides/zamist-chotyryokh-trekeriv",
    module: { href: "/zvyazky", label: "Звʼязки" },
    teaser:
      "Що Sergeant замінює, що переноситься зі старих застосунків (виписки і Strong), що ні (Apple Health, звички та їжа) і коли окремі трекери кращі.",
  },
  {
    href: "/guides/tyzhnevyi-pidsumok",
    module: { href: "/zvyazky", label: "Звʼязки" },
    teaser:
      "Збирається сам при першому відкритті після кінця тижня і охоплює минулий тиждень, тож поточного там ще немає.",
  },
  {
    href: "/guides/kilka-bankiv",
    module: { href: "/hroshi", label: "Гроші" },
    teaser:
      "Monobank підтягується сам, решта карт заходить випискою раз на місяць, і все збирається в одній стрічці.",
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
      "Звʼязаний акаунт приносить чеки по позиціях: сума ділиться за категоріями, продукти йдуть у комору Харчування.",
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
        Розбори про гроші, їжу, звички й дані. Коротка відповідь – на початку
        кожного.
      </p>

      {GROUPS.map((group) => {
        const inGroup = GUIDES.filter((g) => g.module.href === group.href);
        if (inGroup.length === 0) return null;
        return (
          <section key={group.href} className="mt-12">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.12em] text-subtle">
              <a
                href={group.href}
                className="inline-flex min-h-11 items-center underline decoration-cardline-strong underline-offset-4 transition hover:text-foreground-strong hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
                  <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
                    {guide.teaser}
                  </p>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      <p className="mt-8 text-sm text-subtle">
        Про нові гайди пишу в{" "}
        <a
          href={THREADS_URL}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-cardline-strong underline-offset-4 transition hover:text-foreground-strong hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Threads
        </a>{" "}
        і{" "}
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-cardline-strong underline-offset-4 transition hover:text-foreground-strong hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Telegram
        </a>
        .
      </p>
    </SiteLayout>
  );
}
