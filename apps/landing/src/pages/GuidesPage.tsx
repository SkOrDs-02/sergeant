import SiteHeader from "../components/SiteHeader";
import SiteFooter from "../components/SiteFooter";
import { usePageMeta } from "../lib/pageMeta";

/**
 * Реєстр гайдів. Один запис — один файл сторінки; нові гайди додаються
 * сюди і в роутер App.tsx.
 */
const GUIDES = [
  {
    href: "/guides/monobank",
    category: "Фінанси",
    title: "Як підʼєднати Monobank до трекера витрат – і що він реально бачить",
    teaser:
      "Персональний токен за хвилину, таблиця «бачить / не може» і як усе відкликати одним кліком.",
  },
];

export default function GuidesPage() {
  usePageMeta({
    title: "Гайди Sergeant",
    description:
      "Практичні гайди про особисті фінанси, звички і трекінг: коротка відповідь одразу, без води.",
  });

  return (
    <>
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <h1 className="font-display text-4xl font-bold tracking-tight text-foreground-strong sm:text-5xl">
          Гайди
        </h1>
        <p className="mt-5 max-w-xl leading-relaxed text-muted">
          Практичні розбори про гроші, звички і трекінг. Коротка відповідь –
          одразу на початку, без води.
        </p>

        <div className="mt-10 border-b border-cardline">
          {GUIDES.map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block border-t border-cardline py-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <p className="text-xs font-semibold uppercase tracking-widest text-subtle">
                {guide.category}
              </p>
              <h2 className="mt-2 max-w-2xl font-display text-xl font-bold leading-snug text-balance text-foreground-strong group-hover:underline sm:text-2xl">
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
