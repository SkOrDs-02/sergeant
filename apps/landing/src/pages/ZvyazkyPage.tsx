import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import { ConnectionExamples } from "../components/HomeSections";
import TelegramCta from "../components/TelegramCta";

/**
 * Головний диференціатор продукту. Числа тут – з коду
 * (`digestCorrelations.ts`: MIN_N = 10, WINDOW_DAYS = 60) і з
 * `crossModuleLinkTiers.ts` (три рівні). Порогів кореляції сторінка
 * навмисно не називає: вони рухаються, і сайт не має ставати їхнім реєстром.
 */
const TIERS = [
  {
    name: "Поки що збіг",
    text: "Звʼязок помітний, але даних мало. Читати як «цікаво, подивимось далі», не як факт.",
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
  "Кореляція – не причина. «У дні тренувань звички тримаються краще» не означає, що тренування спричиняють звички: можливо, обидва тримаються в тижні, коли тобі просто легше.",
  "Рахується на браузерній версії, на даних, які вже є на пристрої.",
  "Порожня картка – нормальний стан, а не тимчасовий. Для рідкісних величин він може лишатись місяцями.",
];

export default function ZvyazkyPage() {
  usePageMeta({
    ...ROUTE_META["/zvyazky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Звʼязки між грошима, тілом, звичками і їжею",
      inLanguage: "uk",
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
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
        Sergeant тримає всі чотири сфери в одному місці не заради спільного
        логіна. Він рахує, як вони тягнуть одне одного, і показує це тоді, коли
        даних справді вистачає.
      </p>

      <section className="mt-14">
        <h2 className={h2}>Три картки, три різні стани</h2>
        <p className={body}>
          Приклад того, що бачить людина. Дані ілюстративні: Sergeant рахує на
          твоїх.
        </p>
        <div className="mt-8">
          <ConnectionExamples />
        </div>
        <p className="mt-7 max-w-2xl text-sm leading-relaxed text-subtle">
          Третя картка – не заглушка і не помилка верстки. Це те, як виглядає
          чесна відповідь, коли даних замало: продукт не вигадує звʼязок, щоб
          заповнити місце.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Кожен звʼязок підписаний рівнем впевненості</h2>
        <p className={body}>
          Рівнів рівно три, і вони не про красу формулювання, а про силу
          кореляції і кількість спільних днів.
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
          Рівень видно на самій картці. Він може падати: якщо звʼязок перестав
          триматись, підпис зміниться назад.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Перший висновок – не з першого тижня</h2>
        <p className={body}>
          Sergeant рахує звʼязок лише тоді, коли є щонайменше десять днів, у
          яких записані обидві величини. Не десять днів користування – десять
          днів, коли є і те, і те.
        </p>
        <p className={body}>
          Різниця важлива. Якщо ти щодня логуєш їжу, але тренуєшся двічі на
          тиждень, до порогу «їжа ↔ тренування» дійдеш приблизно за пʼять
          тижнів, а не за півтора. Рідкісна величина визначає темп.
        </p>
        <p className={body}>
          Вікно спостереження – останні 60 днів. Найвищий рівень впевненості
          вимагає, щоб спільних днів було не менше половини цього вікна.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Нижче порогу Sergeant не каже нічого</h2>
        <p className={body}>
          Не «даних поки замало, але схоже, що…». Не відсоток упевненості біля
          слабкого звʼязку. Просто порожня картка з чесним написом.
        </p>
        <p className={body}>
          Це рішення проти найпоширенішої вади трекерів із «інсайтами»: вони
          генерують спостереження щотижня, бо порожній екран здається поламаним.
          Спостереження, згенероване з трьох точок, – це шум, поданий тоном
          факту. Одного разу повіривши такому, людина перестає вірити і
          справжнім.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Кожен звʼязок розкривається в дні</h2>
        <p className={body}>
          Під карткою є перемикач, що показує таблицю спільних днів: дата,
          значення першої величини, значення другої. Видно, на чому саме
          побудовано висновок, і чи не тягне його один аномальний день.
        </p>
        <p className={body}>
          Це та сама обіцянка, що й у решті продукту: висновок, який не можна
          перевірити, не вартий того, щоб його показувати.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що з чим порівнюється</h2>
        <p className={body}>
          Пари не довільні – це підібраний список, у якому кожна має сенс з
          погляду людини, а не статистики. Витрати ↔ обʼєм тренувань, алкоголь ↔
          самопочуття, калорії ↔ вага, виконання звичок ↔ будь-що з решти.
        </p>
        <p className={body}>
          Випадкові збіги між неповʼязаними величинами Sergeant не шукає
          навмисне: чим більше пар перебираєш, тим імовірніше знайти «звʼязок»,
          якого немає.
        </p>
        <p className={body}>
          Звʼязки живуть у розділі підсумків, де їх видно всі разом, і в
          тижневому підсумку. Ця частина продукту не платна: рахує її сам
          застосунок на твоїх даних, без звернень до AI.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Як це виглядає</h2>
        <p className={body}>
          Хаб збирає всі чотири сфери на одному екрані – саме з цих даних і
          рахуються звʼязки.
        </p>
        <figure className="mt-6 max-w-[320px]">
          <img
            src="/screens/hub.webp"
            alt="Головний екран Sergeant: картки чотирьох модулів із даними дня і серією"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Хаб: усі чотири сфери на одному екрані. Справжній екран бети, дані з
            демо-режиму продукту.
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
          Що вже працює, а що в розробці –{" "}
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
      </section>
    </SiteLayout>
  );
}
