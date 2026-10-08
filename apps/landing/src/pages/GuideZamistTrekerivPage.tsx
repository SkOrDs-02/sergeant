import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

/**
 * Пряма відповідь на питання, яким люди приходять із пошуку і ШІ-чатів:
 * «додаток, що рахує гроші і звички разом», «альтернатива Apple Health з
 * фінансами». До 2026-09-15 сайт відповідав на нього лише натяками на
 * головній і на /zvyazky, і жодного разу не називав, що з чужих
 * застосунків переноситься, а що ні. Тип `Article`: відповідь, не кроки.
 */
const ROUTE = "/guides/zamist-chotyryokh-trekeriv";

const REPLACES = [
  {
    sphere: "Трекер витрат",
    how: "Операції з Monobank приходять самі, паперовий чек стає витратою з фото, виписка іншого банку завантажується файлом.",
    href: "/hroshi",
  },
  {
    sphere: "Щоденник тренувань",
    how: "Підходи, вага, повтори, рекорди й підказка відпочити, коли навантаження накопичилось.",
    href: "/trenuvannia",
  },
  {
    sphere: "Трекер звичок",
    how: "Серія, яку не обнуляє пропуск із причиною, і огляд дня з тренуваннями й платежами поруч.",
    href: "/zvychky",
  },
  {
    sphere: "Щоденник їжі",
    how: "КБЖВ зі штрихкоду, української бази продуктів, збережених страв і фото з уточнювальними питаннями.",
    href: "/yizha",
  },
];

const TRANSFERS = [
  {
    sphere: "Гроші",
    what: "Виписка будь-якого банку файлом CSV або XLSX: історія за потрібний період заходить одним імпортом і перевіряється перед збереженням. З Monobank історія підтягується сама після підключення.",
  },
  {
    sphere: "Тренування",
    what: "Експорт зі Strong (CSV): тренування, підходи, вага в кг або фунтах. Назви вправ зіставляються з каталогом Фізрука.",
  },
  {
    sphere: "Звички",
    what: "Нічого. Серії з інших трекерів не імпортуються, звички заводяться заново. Історія попереднього застосунку лишається там, де була.",
  },
  {
    sphere: "Їжа",
    what: "Нічого. Щоденник їжі починається з чистого аркуша: перші записи роблять базу збережених страв, далі вони підставляються самі.",
  },
];

const NOT_CONNECTED = [
  "Apple Health, Google Fit, Health Connect: кроки, пульс і сон із телефона чи годинника не читаються. Це майбутній напрям, не поточна можливість.",
  "Інші банки автоматично: жива синхронізація є лише з Monobank, решта заходить випискою файлом раз на період.",
  "Інші трекери звичок і їжі: жодного імпорту серій, рецептів чи історії з чужих застосунків.",
];

const BETTER_ELSEWHERE = [
  "Тобі потрібен готовий план схуднення або тренувань від тренера. Застосунок рахує твої власні цифри і не пише програм.",
  "Бюджет спільний на сімʼю або команду. Тут один простір на одну людину.",
  "Головне джерело даних для тебе – годинник: пульс, сон, кроки. Поки цих входів немає, щоденник тіла буде неповним.",
  "Хочеш, щоб усе велось саме, без жодного запису. Фінанси приходять із банку самі, але їжа, тренування і звички лишаються моментними записами.",
];

export default function GuideZamistTrekerivPage() {
  usePageMeta({
    ...ROUTE_META[ROUTE],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: ROUTE_META[ROUTE].title,
      inLanguage: "uk",
      dateModified: ROUTE_META[ROUTE].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди <span className="font-sans">·</span> Звʼязки
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Чи замінить Sergeant чотири окремі трекери
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено <UpdatedOn iso={ROUTE_META[ROUTE].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/zvyazky" label="Звʼязки" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-3 leading-relaxed text-ink-text">
            Так: гроші, тренування, звички і їжа ведуться в одному застосунку, і
            саме тому між ними рахуються звʼязки, яких чотири окремі трекери не
            бачать. Але історію з чужих застосунків він майже не забирає:
            переносяться банківські виписки і тренування зі Strong, звички і їжа
            починаються з нуля. Apple Health, Google Fit і годинники не
            підключаються.
          </p>
        </div>

        <section>
          <h2 className={h2}>Що саме він замінює</h2>
          <ul className="mt-5 flex flex-col gap-4">
            {REPLACES.map((item) => (
              <li key={item.sphere} className="border-t border-cardline pt-4">
                <h3 className="font-bold text-foreground-strong">
                  <a href={item.href} className={link}>
                    {item.sphere}
                  </a>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {item.how}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Це чотири модулі, кожен зі своєю сторінкою. Жоден не обовʼязковий:
            можна вести лише гроші й звички, і звʼязки рахуватимуться між тими
            сферами, де є дані.
          </p>
        </section>

        <section>
          <h2 className={h2}>Що переноситься зі старих застосунків</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Перенести можна менше, ніж хотілося б.
          </p>
          <div className="mt-6 grid gap-px bg-cardline-strong sm:grid-cols-2">
            {TRANSFERS.map((item) => (
              <div key={item.sphere} className="bg-background p-5">
                <h3 className="font-bold text-foreground-strong">
                  {item.sphere}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.what}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={h2}>Чого він не підключає</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {NOT_CONNECTED.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className={h2}>Навіщо тоді все в одному місці</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Кожен окремий трекер бачить лише свою колонку, тож питання, чому
            тиждень вийшов таким, лишається без відповіді. Застосунок читає всі
            сфери разом і підписує кожен знайдений звʼязок рівнем впевненості:
            від «поки що збіг» до «тримається стабільно».
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            І він уміє мовчати. Поки спільних днів між двома сферами менше
            десяти, звʼязку немає, і застосунок так і каже: «Поки рано
            порівнювати». Для перших тижнів це нормальний стан.{" "}
            <a href="/zvyazky" className={link}>
              Як рахуються звʼязки
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className={h2}>Коли окремі застосунки будуть кращими</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {BETTER_ELSEWHERE.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <p className="text-sm text-subtle">
            Скільки роботи руками лишається після всієї автоматики –{" "}
            <a href="/ruchna-robota" className={link}>
              окремою сторінкою
            </a>
            . Як забрати своє, якщо не підійде –{" "}
            <a href="/vyhid" className={link}>
              на сторінці про вихід
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
