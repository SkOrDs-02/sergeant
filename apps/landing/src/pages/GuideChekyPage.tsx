import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

const SOURCES = [
  { data: "Сума і час покупки", from: "Виписка банку", cheque: false },
  { data: "Назва магазину", from: "Виписка банку", cheque: false },
  {
    data: "Груба категорія (код від банку)",
    from: "Виписка банку",
    cheque: false,
  },
  { data: "Позиції: що саме куплено", from: "Тільки чек", cheque: true },
  { data: "Ціна за одиницю і кількість", from: "Тільки чек", cheque: true },
  { data: "Покупка за готівку", from: "Тільки чек", cheque: true },
];

const STEPS = [
  "Розрівняй чек і поклади на однотонну рівну поверхню. На зімʼятому папері ламаються рядки з цифрами.",
  "Знімай згори, камера паралельно чеку. Під кутом колонка сум стає трапецією, і цифри «пливуть».",
  "Стеж за світлом: тінь від руки і відблиск на термопапері зʼїдають цілі рядки.",
  "Знімай того ж дня. Термопапір вигоряє, і за кілька тижнів у гаманці чек стає порожньою стрічкою.",
];

const SHORT_ANSWER =
  "QR на фіскальному чеку веде в реєстр ДПС, а публічний доступ до нього обмежено на час воєнного стану, тож сканувати код зараз марно. Лишається фото: розпізнавання дістає з нього суму, дату і рядки покупок. Головне тут рядки, бо суму банк і так знає.";

export default function GuideChekyPage() {
  usePageMeta({
    ...ROUTE_META["/guides/cheky"],
    jsonLd: {
      "@context": "https://schema.org",
      // HowTo, а не Article: сторінка веде людину по кроках, і саме кроки
      // мають бути машинно-читабельними. Розширених сніпетів Google для
      // HowTo більше не малює (зняв у вересні 2023), тож адресат тут –
      // AI-споживачі, ті самі, заради яких у нас llms.txt і markdown.
      "@type": "HowTo",
      name: "Як перетворити паперовий чек на облік витрат, коли QR не сканується",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/cheky"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
      step: STEPS.map((text, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        text,
      })),
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди <span className="font-sans">·</span> Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як перетворити паперовий чек на облік витрат, коли QR не сканується
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено <UpdatedOn iso={ROUTE_META["/guides/cheky"].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/hroshi" label="Гроші" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-2.5 font-semibold leading-relaxed text-ink-text">
            {SHORT_ANSWER}
          </p>
        </div>

        <section>
          <h2 className={h2}>Що чек додає до банківської виписки</h2>
          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_150px]">
            <span className="border-b border-cardline-strong py-2.5 pr-4 text-xs font-semibold uppercase tracking-wide text-subtle">
              Дані
            </span>
            <span className="border-b border-cardline-strong py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle">
              Звідки
            </span>
            {SOURCES.map((row) => (
              <div key={row.data} className="contents">
                <span className="border-b border-cardline py-3.5 pr-4 text-sm text-foreground">
                  {row.data}
                </span>
                <span
                  className={`border-b border-cardline py-3.5 text-sm font-bold ${
                    row.cheque ? "text-accent" : "text-muted"
                  }`}
                >
                  {row.from}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Виписка каже «супермаркет, 1&nbsp;240&#8239;₴», і вся сума йде в
            категорію «продукти». Чек показує, що 300&#8239;₴ з них були
            побутовою хімією, ще 200&#8239;₴ – кормом для кота (цифри для
            прикладу). За місяць таких округлень бюджет на продукти виглядає
            роздутим, хоча їси ти як завжди.
          </p>
        </section>

        <section>
          <h2 className={h2}>Що сталося з QR і що робити поки</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            На кожному фіскальному чеку є QR, що веде до цього чека в реєстрі
            ДПС. Публічний доступ до реєстру обмежено на час воєнного стану, тож
            перевірити чек чи витягнути з нього позиції через код зараз не
            вийде.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Коли обмеження знімуть, сканування коду знову стане найшвидшим: дані
            приходитимуть з першоджерела. Поки що спирайся на фото. Воно працює
            для будь-якого магазину і для чеків без робочого коду.
          </p>
        </section>

        <section>
          <h2 className={h2}>Як зняти чек, щоб позиції розпізналися</h2>
          <ol className="mt-5 flex flex-col gap-3.5">
            {STEPS.map((step, i) => (
              <li
                key={i}
                className="flex gap-4 leading-relaxed text-foreground"
              >
                <span className="shrink-0 font-bold text-foreground-strong">
                  {i + 1}.
                </span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Довгий чек великої закупівлі знімай двома кадрами з перекриттям:
            дрібний шрифт здалеку розпізнається найгірше.
          </p>
        </section>

        <section>
          <h2 className={h2}>Окремий випадок: Сільпо</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Якщо привʼязати картку лояльності Сільпо, чеки цієї мережі приходять
            самі, лишається підтвердити розбиття. На фото лишаються інші
            магазини, ринок і готівкові покупки.
          </p>
        </section>

        <section>
          <p className="text-sm text-subtle">
            Усі входи витрат Фініка –{" "}
            <a
              href="/hroshi"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці про гроші
            </a>
            .
          </p>
          <div className="mt-6">
            <TelegramCta placement="footer" label="Стати в чергу" />
          </div>
        </section>
      </article>
    </SiteLayout>
  );
}
