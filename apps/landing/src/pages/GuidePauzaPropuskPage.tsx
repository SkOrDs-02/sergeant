import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

/**
 * Гайд, а не повтор модульної сторінки: `/zvychky` пояснює, ЧОМУ серія
 * переживає пропуск, а тут – які саме кнопки натиснути. Назви елементів
 * узяті з продукту (`shared/i18n/uk.ts` → routinePause, `skipReasons.ts`).
 * Констант мʼякого стріку сторінка не публікує – рішення §10 п. 4 спеки
 * site-ia: числа в коді позначені як нератифіковані.
 */
const REASONS = [
  "Хворів",
  "У дорозі",
  "Не було часу",
  "Свідомий відпочинок",
  "Інше",
];

const NOT_THE_SAME = [
  "Пауза прибирає дні з розкладу: їх немає в підрахунку взагалі.",
  "Причина лишає день у підрахунку, але робить його нейтральним для серії.",
  "Заморозка автоматична, обмежена і не залежить від тебе.",
  "Архівування звички – це не пауза: воно ховає звичку зовсім, а не на період.",
];

export default function GuidePauzaPropuskPage() {
  usePageMeta({
    ...ROUTE_META["/guides/pauza-i-propusk"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Як заявити паузу і пояснити пропуск у трекері звичок",
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
            Як заявити паузу і пояснити пропуск, щоб серія не обнулилась
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
            Знаєш наперед, що днів не буде – постав паузу датами в картці
            звички. Пропустив і хочеш пояснити – відкрий денний звіт і вибери
            причину. Обидва шляхи серію не ламають, і вони різні: пауза прибирає
            дні з розкладу, причина лишає день у підрахунку, але нейтральним.
          </p>
        </div>

        <section>
          <h2 className={h2}>Пауза: коли знаєш наперед</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Відпустка, відрядження, лікарняний – усе, про що відомо заздалегідь
            або що можна описати датами.
          </p>
          <ol className="mt-5 flex flex-col gap-4">
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Відкрий картку звички
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                У модулі Звички натисни на саму звичку, щоб розкрити її деталі.
                Потрібна секція називається «Пауза».
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Постав межі: «З» і «По»
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Друге поле необовʼязкове. Якщо не знаєш, коли повернешся, лиши
                його порожнім – пауза буде відкритою, і в картці зʼявиться
                підпис «На паузі з» датою.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Натисни «Поставити паузу»
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Дні всередині інтервалу випадають із розкладу звички: серія їх
                не бачить і не подовжує на них. Повернувся раніше – кнопка
                «Повернутись сьогодні» закриває паузу поточним днем.
              </p>
            </li>
          </ol>
          <p className="mt-5 leading-relaxed text-muted">
            Пауза знає обидві межі, тому заявлена наперед відпустка не переписує
            минулу статистику. Це важлива відмінність від простого вимкнення
            звички: недатоване вимкнення довелось би вгадувати заднім числом.
          </p>
        </section>

        <section>
          <h2 className={h2}>Причина: коли день уже минув</h2>
          <p className="mt-4 leading-relaxed text-muted">
            День не вийшов, і ти хочеш, щоб це лишилось у статистиці чесно, але
            без удару по серії.
          </p>
          <ol className="mt-5 flex flex-col gap-4">
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Відкрий денний звіт
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Це підсумок дня зі списком запланованих звичок і трьома станами:
                зроблено, не зміг із причиною, не зроблено.
              </p>
            </li>
            <li className="border-t border-cardline pt-4">
              <h3 className="font-bold text-foreground-strong">
                Вибери причину зі списку
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Причина розкривається прямо в рядку звички, окремого діалогу
                немає. Варіанти фіксовані:
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {REASONS.map((reason) => (
                  <li
                    key={reason}
                    className="border border-cardline-strong px-3 py-1 text-xs font-semibold text-foreground"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </li>
          </ol>
          <p className="mt-5 leading-relaxed text-muted">
            Пояснений пропуск нейтральний: він не додає дня до серії, але й не
            обриває її. Формулювання навмисно без докору – «не зміг» у продукті
            не є провалом.
          </p>
        </section>

        <section>
          <h2 className={h2}>А якщо просто забув</h2>
          <p className="mt-4 leading-relaxed text-muted">
            День, у якому ти нічого не відмітив і нічого не пояснив, серія теж
            може пережити – але вже з бюджету, який вона заробила виконаними
            днями. Це єдиний із трьох механізмів, що працює без твоєї участі,
            тому єдиний обмежений: заморозки не видаються наперед, і мовчазний
            пропуск, що триває надто довго, серія все одно назве зупинкою.
          </p>
          <p className="mt-4 leading-relaxed text-muted">
            Тому порада проста: якщо є що сказати про день – скажи причиною,
            вона нічого не коштує. Бюджет прибережи на дні, коли було не до
            застосунку.
          </p>
        </section>

        <section>
          <h2 className={h2}>Що з чим не плутати</h2>
          <ul className="mt-5 flex flex-col gap-3">
            {NOT_THE_SAME.map((item) => (
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
            Чому серія влаштована саме так –{" "}
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
