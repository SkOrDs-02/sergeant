import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

/**
 * Гайд пояснює перегляд, не механіку: календар Рутини лише показує
 * тренування Фізрука і планові платежі Фініка, редагування лишається в
 * своєму модулі. Назви тумблерів узяті з продукту (`RoutineSection.tsx`),
 * назва чипа – з `uk.routine.ts` (`filterChips.finykSubs`). Про одноразові
 * події («колись») – мовчання навмисне, це відкритий продуктовий борг.
 */
const SOURCES = [
  {
    title: "Тренування з Фізрука",
    body: "Дні, на які в Фізруку заплановане тренування за місячним планом. У картці видно назву шаблону тренування.",
  },
  {
    title: "Планові платежі Фініка",
    body: "Майбутні списання за підписками з Фініка – ті, для яких у модулі задана регулярність.",
  },
];

const LIMITS = [
  "Це вітрина чужих даних, не редактор. Змінити тренування можна тільки в Фізруку, платіж – тільки у Фініку.",
  "Тумблер вимикає показ у календарі Рутини, а не саму подію – тренування чи платіж нікуди не зникають зі свого модуля.",
];

export default function GuideOhlyadDnyaPage() {
  usePageMeta({
    ...ROUTE_META["/guides/ohlyad-dnya"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Як бачити тренування і планові платежі поруч зі звичками",
      inLanguage: "uk",
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди · Звички
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як бачити тренування і планові платежі поруч зі звичками
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено 31.08.2026 · автор Sergeant
          </p>
          <GuideHomeModule href="/zvychky" label="Звички" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-3 leading-relaxed text-ink-text">
            Календар модуля Звички показує не лише звички: поряд із ними в
            місячній сітці й у стрічці дня зʼявляються заплановані тренування з
            Фізрука і планові платежі підписок з Фініка. Обидва джерела можна
            окремо вимкнути в налаштуваннях – це саме перегляд, зміни вносяться
            у своєму модулі.
          </p>
        </div>

        <section>
          <h2 className={h2}>Звідки беруться чужі події</h2>
          <p className="mt-4 leading-relaxed text-muted">
            У сітці місяця і в стрічці дня календар Рутини зводить три джерела в
            один список. Крім самих звичок туди підмішуються:
          </p>
          <ol className="mt-5 flex flex-col gap-4">
            {SOURCES.map((s) => (
              <li key={s.title} className="border-t border-cardline pt-4">
                <h3 className="font-bold text-foreground-strong">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className={h2}>Де це в інтерфейсі</h2>
          <ol className="mt-5 flex flex-col gap-4">
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Відкрий місячну сітку або стрічку дня
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                У вкладці «Огляд» модуля Звички тренування й платежі позначені
                кольоровою смужкою зліва в картці події й окремим кольором
                клітинки в сітці місяця.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Фільтруй чипами над стрічкою
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Чип «Фізрук» лишає в стрічці тільки тренування, чип «Підписки
                Фініка» – тільки платежі. Обидва вимикаються так само, як тег чи
                категорія.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Керуй показом у налаштуваннях
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                У розділі налаштувань «Рутина» → «Календар» два тумблери:
                «Показувати тренування з Фізрука в календарі» і «Показувати
                планові платежі підписок Фініка в календарі». Вимкнений тумблер
                прибирає джерело зі стрічки й сітки повністю.
              </p>
            </li>
          </ol>
        </section>

        <section>
          <h2 className={h2}>Що тут не можна</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {LIMITS.map((item) => (
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
          <p className="mt-5 leading-relaxed text-muted">
            Натискання на картку тренування чи платежу відкриває деталі в своєму
            модулі – Фізруку або Фініку. Календар Рутини туди лише веде, сам
            нічого не зберігає.
          </p>
        </section>

        <section>
          <p className="text-sm text-subtle">
            Як влаштована серія і статистика звичок –{" "}
            <a
              href="/zvychky"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці модуля
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
