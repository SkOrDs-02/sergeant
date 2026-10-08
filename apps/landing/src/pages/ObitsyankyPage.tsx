import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";
import { PREMIUM_CLAIM } from "../content/premiumClaim";
import { FREE_LIMITS_CLAIM } from "../content/freeLimitsClaim";

/**
 * Пʼять обіцянок продукту. Пункт 04 навмисно несе межу: єдиного експорту,
 * що зводить акаунтські дані й дані модулів в один файл, поки немає
 * (`product-overview.md` §11). Формулювання «усіх даних одним кліком»,
 * яке стояло на головній, фактчек не підтвердив.
 */
const RULES = [
  {
    n: "01",
    title: "Жодних нотацій",
    text: "Перевищений бюджет, пропущене тренування чи зірвана звичка стають записами в статистиці. Застосунок рахує і показує, решту лишає тобі.",
    extra: "Без докорів і мотиваційних цитат.",
    link: null,
  },
  {
    n: "02",
    title: "Висновки з доказами",
    text: "Кожен звʼязок підписаний рівнем впевненості і розгортається в дні, на яких порахований. Коли даних замало, звʼязок не показується.",
    extra:
      "Це найдорожча обіцянка зі списку: генерувати «інсайт» щотижня легко, мовчати, коли нема чого сказати, важко.",
    link: { href: "/zvyazky", label: "Як це влаштовано" },
  },
  {
    n: "03",
    title: "Нічого не записує мовчки",
    text: "Розпізнаний чек чи фото страви лягає чернеткою, яку ти підтверджуєш або правиш. Токен банку лише читає: заплатити ним неможливо.",
    extra: null,
    link: { href: "/data", label: "Що саме бачить Sergeant" },
  },
  {
    n: "04",
    title: "Забрати своє можна завжди",
    text: "Дані експортуються у відкритому форматі. Акаунт видаляєш сам, без листів у підтримку. Памʼять Сержанта чистиш по одному запису або цілком.",
    extra:
      "Єдиної кнопки «забрати все» поки немає: акаунтські дані вивантажуються з профілю, дані модулів локальним бекапом. Дані не продаються. Якщо продукт зупинятиметься, попереджу щонайменше за 30 днів, і весь цей час експорт працюватиме.",
    link: null,
  },
  {
    n: "05",
    title: "Ядро безкоштовне назавжди",
    text: "Чотири модулі, ручний трекінг і підключення банку платними не стануть.",
    extra: `${PREMIUM_CLAIM}. ${FREE_LIMITS_CLAIM}, а банк, синхронізація між пристроями і ручний трекінг лишаються безкоштовними.`,
    link: null,
  },
];

const CHECKS = [
  "«Нічого не записує мовчки»: сфотографуй чек і подивись, що зʼявиться чернетка, ще не витрата.",
  "«Висновки з доказами»: розгорни будь-який звʼязок у список днів.",
  "«Забрати своє можна завжди»: вивантаж експорт до того, як накопичиш щось важливе.",
  "«Жодних нотацій»: зірви звичку навмисно і подивись, що скаже продукт.",
];

export default function ObitsyankyPage() {
  usePageMeta({
    ...ROUTE_META["/obitsyanky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Обіцянки Sergeant",
      inLanguage: "uk",
      numberOfItems: RULES.length,
      itemListElement: RULES.map((rule, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: rule.title,
        description: rule.text,
      })),
    },
  });

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-5xl">
        Що обіцяю
      </h1>
      <p className="mt-5 max-w-xl leading-relaxed text-muted">
        Пʼять пунктів, за які мене можна тримати. Кожен перевіряється в самому
        застосунку.
      </p>

      <div className="mt-10 flex flex-col">
        {RULES.map((rule) => (
          <div
            key={rule.n}
            className="grid gap-2 border-t-2 border-foreground-strong py-6 sm:grid-cols-[90px_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[90px_minmax(0,1fr)_420px]"
          >
            <span className="font-display text-sm font-bold text-subtle">
              {rule.n}
            </span>
            <h2 className="text-2xl font-bold leading-tight text-foreground-strong sm:text-[27px]">
              {rule.title}
            </h2>
            <div className="flex flex-col gap-3">
              <p className="text-sm leading-relaxed text-muted">
                {rule.text}
                {rule.link && (
                  <>
                    {" "}
                    <a
                      href={rule.link.href}
                      className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      {rule.link.label}
                    </a>
                  </>
                )}
              </p>
              {rule.extra && (
                <p className="text-sm leading-relaxed text-subtle">
                  {rule.extra}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 border-t-2 border-foreground-strong pt-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong">
          Кожен пункт перевіряється руками
        </h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          Як перевірити:
        </p>
        <ul className="mt-5 flex max-w-2xl flex-col gap-3">
          {CHECKS.map((check) => (
            <li
              key={check}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {check}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-subtle">
          Що з обіцяного вже працює –{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у доповіді про стан
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </div>
    </SiteLayout>
  );
}
