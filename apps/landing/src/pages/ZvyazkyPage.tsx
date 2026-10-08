import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { ConnectionExamples } from "../components/HomeSections";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_JSON_LD } from "../content/author";

/**
 * Головний диференціатор продукту. Числа тут – з коду
 * (`digestCorrelations.ts`: MIN_N = 10, WINDOW_DAYS = 60) і з
 * `crossModuleLinkTiers.ts` (три рівні). Порогів кореляції сторінка
 * навмисно не називає: вони рухаються, і сайт не має ставати їхнім реєстром.
 */
const TIERS = [
  {
    name: "Поки що збіг",
    text: "Звʼязок помітний, але даних мало: читати як «цікаво, подивлюся далі».",
  },
  {
    name: "Повторюється",
    text: "Той самий звʼязок тримається на більшій вибірці.",
  },
  {
    name: "Тримається стабільно",
    text: "Сильна кореляція, і спільні дні покривають щонайменше половину вікна спостереження.",
  },
];

const LIMITS = [
  "Кореляція ще не причина. «У дні тренувань звички тримаються краще» не означає, що тренування спричиняють звички: можливо, обидва тримаються в тижні, коли тобі легше.",
  "Рахується у веб-версії, на даних, які вже є на пристрої.",
  "Порожня картка для рідкісних величин може лишатись місяцями, і це нормальний стан.",
];

export default function ZvyazkyPage() {
  usePageMeta({
    ...ROUTE_META["/zvyazky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Звʼязки між грошима, тілом, звичками і їжею",
      inLanguage: "uk",
      dateModified: ROUTE_META["/zvyazky"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Звʼязки між сферами
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Окремі трекери показують цифри. Кожен – свою. Скільки я витратив.
        Скільки підняв. Скільки зʼїв. Три застосунки, три графіки, і жоден не
        відповідає на питання, чому тиждень вийшов таким, яким вийшов.
      </p>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Застосунок тримає всі чотири сфери разом, щоб рахувати, як вони тягнуть
        одна одну, і показує це лише тоді, коли даних вистачає.
      </p>

      <section className="mt-14">
        <h2 className={h2}>Три картки, три різні стани</h2>
        <p className={body}>Дані ілюстративні: застосунок рахує на твоїх.</p>
        <div className="mt-8">
          <ConnectionExamples />
        </div>
        <p className="mt-7 max-w-2xl text-sm leading-relaxed text-subtle">
          Третя картка порожня навмисно: коли даних замало, застосунок не
          вигадує звʼязок, щоб заповнити місце.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Кожен звʼязок підписаний рівнем впевненості</h2>
        <p className={body}>
          Рівень залежить від сили кореляції і кількості спільних днів.
        </p>
        <dl className="mt-6 flex flex-col gap-5">
          {TIERS.map((tier) => (
            <div key={tier.name} className="border-t border-cardline pt-4">
              <dt className="font-bold text-foreground-strong">{tier.name}</dt>
              <dd className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {tier.text}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          Рівень видно на картці, і він може падати: якщо звʼязок перестав
          триматись, підпис зміниться назад.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Перший висновок після десяти спільних днів</h2>
        <p className={body}>
          Застосунок рахує звʼязок, коли назбиралось щонайменше десять днів, у
          які обидві сфери вже були в роботі.
        </p>
        <p className={body}>
          Для частини величин «немає запису» дорівнює нулю: день без тренування
          означає нуль тоннажу. Тому день, коли ти записав їжу і не тренувався,
          для пари «їжа ↔ тренування» рахується. Вага чи самопочуття без запису
          лишаються невідомими, і такий день не рахується.
        </p>
        <p className={body}>
          Вікно спостереження: останні 60 днів. Найвищий рівень вимагає, щоб
          спільних днів було не менше половини вікна.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Нижче порогу застосунок мовчить</h2>
        <p className={body}>
          Нижче порогу картка лишається порожньою: без «схоже, що…» і без
          відсотків біля слабкого звʼязку. Спостереження з трьох точок – це шум,
          поданий як факт, і застосунок його не показує.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Кожен звʼязок розкривається в дні</h2>
        <p className={body}>
          Під карткою є перемикач, що показує таблицю спільних днів: дата,
          значення першої величини, значення другої. Видно, на чому побудовано
          висновок, і чи не тягне його один аномальний день.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що з чим порівнюється</h2>
        <p className={body}>
          Пари підібрані наперед, і кожна має сенс з погляду людини: витрати ↔
          обʼєм тренувань, алкоголь ↔ самопочуття, калорії ↔ вага, виконання
          звичок ↔ будь-що з решти.
        </p>
        <p className={body}>
          Випадкові збіги між неповʼязаними величинами застосунок не шукає: чим
          більше пар перебираєш, тим імовірніше знайти «звʼязок», якого немає.
        </p>
        <p className={body}>
          Звʼязки живуть у власному розділі застосунку: три найпомітніші, перший
          розгорнутою карткою, решта рядками. У звіті тижня їх немає, той звіт
          іде по модулях окремо. Ця частина продукту безкоштовна: рахує її сам
          застосунок на твоїх даних, без звернень до AI.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Як це виглядає</h2>
        <p className={body}>
          Звʼязки живуть на окремій вкладці хаба. Кожен підписаний рівнем
          впевненості і кількістю днів, на яких він тримається.
        </p>
        <figure className="mt-6 max-w-[320px]">
          <img
            src="/screens/zvyazky.webp"
            alt="Вкладка «Звʼязки»: звички й самопочуття на рівні «тримається стабільно» за 46 спостережень, тренування і їжа на рівні «поки що збіг»"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Вкладка «Звʼязки»: два звʼязки з різними рівнями впевненості. Екран
            бети з демо-даними.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Межі</h2>
        <ul className="mt-5 flex max-w-2xl flex-col gap-3">
          {LIMITS.map((limit) => (
            <li
              key={limit}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {limit}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-subtle">
          Що з цього вже працює, видно на сторінці про{" "}
          <a
            href="/stan"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            стан розробки
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
