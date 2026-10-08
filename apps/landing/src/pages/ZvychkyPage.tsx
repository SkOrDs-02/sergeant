import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import ModuleFooterLinks from "../components/ModuleFooterLinks";
import { AUTHOR_JSON_LD } from "../content/author";
import { MOBILE_CLAIM } from "../content/mobileClaim";

const WAYS = [
  {
    n: "01",
    title: "Пауза, оголошена наперед",
    text: "Відпустка чи лікарняний ставляться датами: з якого дня по який. Дні всередині паузи випадають із розкладу звички: не ламають серію і не подовжують її.",
  },
  {
    n: "02",
    title: "День, коли не зміг",
    text: "Відкриваєш денний звіт, тиснеш «Не зміг» і обираєш причину. День стає нейтральним. Серія його переживає, але не росте: накопичують тільки виконані дні.",
  },
  {
    n: "03",
    title: "Пропуск, за який нічого не треба пояснювати",
    text: "День, коли ти нічого не відмітив і нічого не пояснив. Такий пропуск серія теж переживає, але вже з бюджету, який сама заробила виконаними днями. Це єдиний механізм, що прощає без твоєї участі, тому єдиний під квотою.",
  },
];

const BOUNDARIES = [
  "Таск-менеджера: немає проєктів, строків, підзадач і вкладеності. Разова подія можлива, але лишається винятком у межах дня.",
  "Коучингу: немає програм «21 день» і нотацій за зірваний день. Є відмітка, розклад, статистика і серія.",
  "Обмеження на кількість звичок: скільки хочеш.",
];

const GUIDES = [
  {
    href: "/guides/pauza-i-propusk",
    title: "Як заявити паузу і пояснити пропуск, щоб серія не обнулилась",
    teaser: "Три різні механізми мʼякості і кроки для кожного з них.",
  },
  {
    href: "/guides/ohlyad-dnya",
    title: "Як бачити тренування і планові платежі поруч зі звичками",
    teaser:
      "Що саме підтягується в календар з інших модулів і де межі перегляду.",
  },
];

export default function ZvychkyPage() {
  usePageMeta({
    ...ROUTE_META["/zvychky"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Звички, де один пропуск не обнуляє серію",
      inLanguage: "uk",
      dateModified: ROUTE_META["/zvychky"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-routine-strong">
        Модуль <span className="font-sans">·</span> Рутина
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Звички, де один пропуск не обнуляє серію
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Рутина – трекер звичок, який памʼятає, чому ти пропустив день. Захворів,
        поїхав, свідомо взяв вихідний: день можна назвати тим, чим він був.
        Серія це переживає, а відсоток виконання дня і тижня такий день у
        знаменник не бере.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/zvychky"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Три способи пропустити день і не обнулитись</h2>
        <p className={body}>
          Перші два ти оголошуєш сам, третій спрацьовує без тебе.
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
          Сьогоднішній незакритий день сюди не належить: він ще не закінчився, і
          ранкова цифра серії не падає в нуль до першої відмітки.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Причини пропуску: закритий список</h2>
        <p className={body}>
          Причина обирається з короткого закритого списку, без вільного тексту.
          Свідомий відпочинок стоїть у ньому нарівні з хворобою. Зведення за
          місяць застосунок поки не будує: причину видно на самому дні.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
          Сам список, а також які кнопки натискати для паузи, причини й
          заморозки –{" "}
          <a href="/guides/pauza-i-propusk" className={link}>
            у гайді про паузу і пропуск
          </a>
          .
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чому день із причиною виходить зі знаменника</h2>
        <p className={body}>
          Кожна звичка має розклад, і відсоток виконання рахується від
          запланованих днів. День, який ти позначив причиною, виходить із цього
          знаменника: він не рахується ні виконанням, ні провалом.
        </p>
        <p className={body}>
          Це ж правило захищає бюджет заморозок: день із причиною його не
          витрачає, бо пояснений пропуск не має коштувати стільки ж, скільки
          мовчазний.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          «Не зміг» – це третій стан дня, а не мʼякіший спосіб сказати
          «провалив».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Поточна поведінка заморозок</h2>
        <p className={body}>
          Заморозки заробляються серією виконаних днів: коротка серія їх ще не
          має. Бюджет не безмежний: мовчазний пропуск, що триває надто довго,
          серія все одно називає зупинкою, скільки б заморозок не лишалось.
          Числа заморозок ще можуть змінитись.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Не тільки відмітки: огляд дня</h2>
        <p className={body}>
          Календар Рутини показує день цілком. Поруч із відмітками стоїть{" "}
          <a href="/trenuvannia" className={link}>
            тренування з Фізрука
          </a>
          , якщо воно заплановане на цей день, і{" "}
          <a href="/hroshi" className={link}>
            планові платежі з Фініка
          </a>
          , тобто підписки, про які сьогодні варто памʼятати. Відмічаєш звички і
          тут же бачиш, що ще на тебе чекає.
        </p>
        <p className={body}>
          Дані при цьому лишаються у своїх модулях: тап по тренуванню відкриває
          Фізрук.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Де це вже працює</h2>
        <p className={body}>
          Усе описане вище стосується веб-версії. {MOBILE_CLAIM}
        </p>
        <p className={body}>
          Ще одна межа всередині вебу: у календарі й у відсотку виконання день
          із причиною зі знаменника виходить, але зведення на сторінці
          статистики його поки не виключає.
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
            alt="Денний звіт Рутини: пʼять виконаних звичок і пропуск «10 000 кроків» із причиною «У дорозі», який не ламає серію"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Рутина: звички дня, тижнева стрічка і серія. Екран бети з
            демо-даними.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Гайди про звички</h2>
        <div className="mt-6 border-b border-cardline">
          {GUIDES.map((guide) => (
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
        <ModuleFooterLinks />
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
