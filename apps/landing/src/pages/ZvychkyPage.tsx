import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

const WAYS = [
  {
    n: "01",
    title: "Пауза, оголошена наперед",
    text: "Відпустка чи лікарняний ставляться датами: з якого дня по який. Дні всередині паузи випадають із розкладу звички. Вони не ламають серію і не подовжують її – їх просто немає в підрахунку.",
  },
  {
    n: "02",
    title: "День, коли не зміг",
    text: "Відкриваєш денний звіт, тиснеш «Не зміг» і обираєш причину. День стає нейтральним. Серія його переживає, але не росте – накопичують тільки виконані дні.",
  },
  {
    n: "03",
    title: "Пропуск, за який нічого не треба пояснювати",
    text: "Буває день, коли ти нічого не відмітив і нічого не пояснив. Такий пропуск серія теж переживає, але вже з бюджету, який вона сама заробила виконаними днями. Це єдиний із трьох механізмів, що прощає без твоєї участі, тому єдиний під квотою.",
  },
];

const REASONS = [
  "хворів",
  "у дорозі",
  "не було часу",
  "свідомий відпочинок",
  "інше",
];

const BOUNDARIES = [
  "Таск-менеджера. Немає проєктів, дедлайнів, підзадач і вкладеності. Разова подія тут можлива, але вона лишається винятком у межах дня, а не задачею.",
  "Коучингу формування звичок. Немає програм «21 день» і нотацій за зірваний день. Є відмітка, розклад, статистика і серія.",
  "Обмеження на кількість звичок. Скільки хочеш – у коді ліміту немає. Про цінову модель сторінка мовчить: комерція вимкнена прапорцем, тарифів у продукті ще немає, тож обіцяти «і не буде» нема на чому.",
];

export default function ZvychkyPage() {
  usePageMeta({
    ...ROUTE_META["/zvychky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Звички, де один пропуск не обнуляє серію",
      inLanguage: "uk",
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";
  const h3 = "mt-8 text-lg font-bold text-foreground-strong";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-routine-strong">
        Модуль · Рутина
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Звички, де один пропуск не обнуляє серію
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Захворів, поїхав, свідомо взяв вихідний – день можна назвати тим, чим
        він був. Серія це переживає, а відсоток виконання дня і тижня такий день
        у знаменник не бере.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Три способи пропустити день і не обнулитись</h2>
        <p className={body}>
          Це три різні механізми, а не три назви одного. Вони не замінюють один
          одного: перші два ти оголошуєш сам, третій спрацьовує без тебе.
        </p>
        <div className="mt-8 grid gap-px bg-cardline-strong sm:grid-cols-3">
          {WAYS.map((way) => (
            <div key={way.n} className="bg-background p-6">
              <p className="font-display text-sm font-bold text-subtle">
                {way.n}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-tight text-foreground-strong">
                {way.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {way.text}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          Сьогоднішній незакритий день до цього не належить. День ще не
          закінчився, і серія його не втратила: ранкова цифра не падає в нуль до
          першої відмітки.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Пʼять причин, і список закритий</h2>
        <p className={body}>
          Причина обирається зі списку, а не пишеться щоразу заново:{" "}
          {REASONS.map((reason, index) => (
            <span key={reason}>
              <strong className="text-foreground-strong">{reason}</strong>
              {index < REASONS.length - 1 ? ", " : ""}
            </span>
          ))}
          . Список короткий навмисно – по ньому можна згрупувати місяць і
          побачити, що саме забирає дні.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
          Свідомий відпочинок стоїть у списку нарівні з хворобою. Вихідний, який
          ти собі дав, – це причина, а не виправдання.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чому день із причиною виходить зі знаменника</h2>
        <p className={body}>
          Кожна звичка має розклад, і відсоток виконання рахується від
          запланованих днів, а не від усіх днів календаря. День, який ти
          позначив причиною, виходить із цього знаменника взагалі: він не
          рахується ні виконанням, ні провалом.
        </p>
        <p className={body}>
          Це ж правило захищає бюджет заморозок: день із причиною його не
          витрачає. Пояснений пропуск не має коштувати того самого, що
          мовчазний, – інакше пояснювати не було б сенсу.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          «Не зміг» – це третій стан дня, а не мʼякіший спосіб сказати
          «провалив».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Поточна поведінка заморозок</h2>
        <p className={body}>
          Заморозки заробляються самою серією виконаних днів, а не видаються
          наперед: коротка серія їх ще не має. Заробленого бюджету не вистачає
          на нескінченну кількість поспіль – мовчазний пропуск, що триває надто
          довго, серія все одно називає зупинкою, скільки б заморозок не
          лишалось.
        </p>
        <p className={body}>
          Це поведінка на сьогодні, а не обіцянка на завжди: конкретні числа
          заробітку й стелі ще не ратифіковані як продуктове рішення. Якщо вони
          зміняться, видима цифра серії зміниться разом із ними.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Не тільки відмітки: огляд дня</h2>
        <p className={body}>
          Календар Рутини показує день цілком, а не лише список звичок. Поруч із
          відмітками стоїть{" "}
          <a
            href="/trenuvannia"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            тренування з Фізрука
          </a>
          , якщо воно заплановане на цей день, і{" "}
          <a
            href="/hroshi"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            планові платежі з Фініка
          </a>{" "}
          – підписки, про які сьогодні варто памʼятати. Чекін і огляд живуть на
          одному екрані: відмічаєш звички і тут же бачиш, що ще на тебе чекає.
        </p>
        <p className={body}>
          Це огляд, а не переїзд даних. Тренуванням володіє Фізрук, платежами –
          Фінік; Рутина лише показує їх у стрічці дня, а тап по тренуванню
          відкриває поверхню Фізрука, не копію в Рутині. Тому огляд дня не
          перетворює Рутину на задачник: проєктів, дедлайнів і підзадач тут
          немає.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чесно: де ця механіка діє, а де ще ні</h2>
        <p className={body}>
          Усе описане вище – поведінка веб-версії. Sergeant працює у браузері:
          на телефоні й на компʼютері. Мобільний застосунок працює і
          синхронізується так само, але його публічний вихід відкладено, і поки
          він не переведений на цю ж логіку, він показує жорстку серію і власні,
          нижчі відсотки на тих самих даних. Тому сторінка говорить про веб, а
          не про «продукт узагалі».
        </p>
        <p className={body}>
          Друга нерівність усередині самого вебу: у календарі й у відсотку
          виконання день із причиною зі знаменника виходить, а зведення на
          сторінці статистики його поки що не виключає. Клітинка там уже показує
          окремий стан, число – ще ні.
        </p>
        <h3 className={h3}>Чи мотивують серії взагалі – відкрите питання</h3>
        <p className={body}>
          Серія зроблена мʼякою не тому, що доведено її користь, а тому що
          жорстка демотивує. Якщо колись виявиться, що серія нічого не дає, це
          буде названо тут, а не мовчки прибрано.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого тут немає</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {BOUNDARIES.map((item) => (
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

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Як це виглядає</h2>
        <figure className="mt-6 max-w-[320px]">
          <img
            src="/screens/routine.webp"
            alt="Екран Рутини: звички за сьогодні, тижнева стрічка днів і лічильник серії"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Рутина: звички дня, тижнева стрічка і серія. Справжній екран бети,
            дані з демо-режиму продукту.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Гайди про звички</h2>
        <div className="mt-6 border-b border-cardline">
          {[
            {
              href: "/guides/pauza-i-propusk",
              title:
                "Як заявити паузу і пояснити пропуск, щоб серія не обнулилась",
              teaser: "Три різні механізми мʼякості і кроки для кожного з них.",
            },
            {
              href: "/guides/ohlyad-dnya",
              title: "Як бачити тренування і планові платежі поруч зі звичками",
              teaser:
                "Що саме підтягується в календар з інших модулів і де межі перегляду.",
            },
          ].map((guide) => (
            <a
              key={guide.href}
              href={guide.href}
              className="group block border-t border-cardline py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <h3 className="max-w-2xl text-lg font-bold leading-snug text-foreground-strong group-hover:underline">
                {guide.title}
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {guide.teaser}
              </p>
            </a>
          ))}
        </div>
        <p className="mt-8 text-sm text-subtle">
          Як Рутина звʼязана з рештою сфер –{" "}
          <a
            href="/zvyazky"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            на сторінці про звʼязки
          </a>
          , що вже працює –{" "}
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
