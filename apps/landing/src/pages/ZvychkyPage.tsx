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
    text: "Відпустку чи лікарняний ставиш датами. Ці дні випадають із розкладу: серію не ламають і не подовжують.",
  },
  {
    n: "02",
    title: "День, коли не зміг",
    text: "У денному звіті тиснеш «Не зміг» і обираєш причину. Серія такий день переживає, але не росте.",
  },
  {
    n: "03",
    title: "Пропуск без пояснень",
    text: "День без відмітки і без причини. Серія переживає і його, але витрачає на це заморозку, зароблену виконаними днями. Заморозок обмежена кількість.",
  },
];

const BOUNDARIES = [
  "Списку справ: проєктів, строків і підзадач немає. Разову подію на день додати можна.",
  "Коучингу: ні програм «21 день», ні нотацій за зірваний день.",
  "Ліміту на кількість звичок.",
];

const GUIDES = [
  {
    href: "/guides/pauza-i-propusk",
    title: "Як заявити паузу і пояснити пропуск, щоб серія не обнулилась",
    teaser: "Три способи і що натискати для кожного.",
  },
  {
    href: "/guides/ohlyad-dnya",
    title: "Як бачити тренування і планові платежі поруч зі звичками",
    teaser: "Що з інших модулів видно в календарі.",
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
        Рутина – трекер звичок, який памʼятає, чому ти пропустив день: захворів,
        поїхав чи взяв вихідний. Серія такий день переживає, і до відсотка
        виконання він не входить.
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
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                {way.text}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          Сьогоднішній день ще триває, тому зранку серія не падає в нуль до
          першої відмітки.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Причини пропуску: закритий список</h2>
        <p className={body}>
          Причину обираєш з короткого списку, без вільного тексту. Свідомий
          відпочинок стоїть у ньому нарівні з хворобою. Причину видно на самому
          дні, зведення за місяць поки немає.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-subtle">
          Повний список і що де натискати –{" "}
          <a href="/guides/pauza-i-propusk" className={link}>
            у гайді про паузу і пропуск
          </a>
          .
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>День із причиною не йде у відсоток</h2>
        <p className={body}>
          Відсоток виконання рахується від запланованих днів. День із причиною
          не рахується ні виконанням, ні провалом.
        </p>
        <p className={body}>Заморозку такий день теж не витрачає.</p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          «Не зміг» – це третій стан дня, а не мʼякіший спосіб сказати
          «провалив».
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Заморозки</h2>
        <p className={body}>
          Заморозки заробляються виконаними днями, тож у короткої серії їх ще
          немає. Якщо мовчазний пропуск затягнувся, серія зупиняється, навіть
          коли заморозки лишились. Кількість заморозок ще може змінитись.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Огляд дня</h2>
        <p className={body}>
          У календарі Рутини поруч із відмітками стоїть{" "}
          <a href="/trenuvannia" className={link}>
            тренування з Фізрука
          </a>
          , якщо воно заплановане, і{" "}
          <a href="/hroshi" className={link}>
            планові платежі з Фініка
          </a>{" "}
          на цей день.
        </p>
        <p className={body}>Дотик до тренування відкриває Фізрук.</p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Де це вже працює</h2>
        <p className={body}>Усе описане – у веб-версії. {MOBILE_CLAIM}</p>
        <p className={body}>
          День із причиною не рахується ніде: ні в календарі, ні у відсотку
          виконання, ні в зведенні на сторінці статистики.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого тут немає</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {BOUNDARIES.map((item) => (
            <li
              key={item}
              className="flex items-baseline gap-2.5 text-[15px] leading-relaxed text-muted"
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
            alt="Денний звіт Рутини: три виконані звички і пропуск «Розтяжки» з причиною «Не було часу», який не ламає серію"
            width={390}
            height={844}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Рутина: денний звіт із виконаними звичками і пропуском. Екран бети з
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
              <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-muted">
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
