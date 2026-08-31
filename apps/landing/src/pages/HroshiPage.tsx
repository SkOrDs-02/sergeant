import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import MonoAccessTable from "../components/MonoAccessTable";
import TelegramCta from "../components/TelegramCta";

/**
 * Модуль Фінік. Рішення фаундера 2026-08-30 (site-ia §10 п. 7): входів
 * чотири, а не три – чек і виписка рахуються окремо, бо це різні дії
 * людини з різним результатом.
 */
const ENTRIES = [
  {
    n: "01",
    title: "Банк присилає операції сам",
    text: "Monobank надсилає операцію, щойно вона сталась. Окремо є ручне довантаження за останній 31 день – коли треба добрати те, що було до підключення. Автоматично приходять тільки операції Monobank: інших банківських підключень у Фініку немає.",
  },
  {
    n: "02",
    title: "Чек стає витратою з фотографії",
    text: "Разом із позиціями: що саме куплено, по скільки і в якій кількості. Банк знає суму й магазин, рядки покупок є тільки на чеку.",
  },
  {
    n: "03",
    title: "Виписку можна завантажити файлом",
    text: "Якщо банк не дає автосинку, але дає виписку, витрати за місяць заводяться одним файлом замість форми на кожен рядок.",
  },
  {
    n: "04",
    title: "Руками – коли доказу немає",
    text: "Ручна форма має детальнішу розбивку, ніж MCC-каталог банку: «Кафе та ресторани» і «Техніка» існують тільки в ній. Назву можна не писати: у списку буде нейтральне «Ручна витрата», а категорія лишиться окремим чипом.",
  },
];

const RECEIPT_STEPS = [
  {
    title: "Фото",
    text: "Знімаєш чек – розпізнавання дістає суму, дату і рядки покупок. У коді є і другий шлях, через QR фіскального чека і реєстр ДПС, але публічний доступ до реєстру обмежено на час воєнного стану, тож сьогодні працює саме фото.",
  },
  {
    title: "Чернетка",
    text: "Результат лягає чернеткою з бейджем «перевір суми». Це не запис – це пропозиція.",
  },
  {
    title: "Екран перевірки",
    text: "Обовʼязковий, без нього збереження не відбувається. Суму, дату, категорію і кожну позицію можна виправити.",
  },
  {
    title: "Запис",
    text: "Збережений чек шукає собі банківську операцію за сумою і датою в межах доби і привʼязується до неї. Не знайшов – стає окремою ручною витратою.",
  },
];

const FORMATS = [
  "CSV – читається",
  "XLSX – читається",
  "HTML-таблиця під іменем .xls – читається",
  "PDF – відмова прямим текстом: візьми в банку той самий період у XLSX або CSV",
  "бінарний Excel 97 – відмова з інструкцією перезберегти файл",
];

const BOUNDARIES = [
  "Не рухає гроші. Ні платежів, ні переказів, ні оплати рахунків. Це облік, не банкінг.",
  "Не веде інвестиції. Активи – ручний список вартостей, без котирувань і брокерських підключень.",
  "Не рахує ФОП. Ні бізнес-обліку, ні податкової звітності.",
  "Автосинк лише з Monobank. Інші банки заводяться випискою файлом або чеками.",
  "Позначка «у транзакції є чек» живе на пристрої: чек, засканований на телефоні, не підсвітить ту саму операцію на компʼютері.",
  "Працює у браузері – на телефоні й компʼютері. Мобільний застосунок теж працює і синхронізується, але його публічний вихід відкладено.",
];

const GUIDES = [
  {
    href: "/guides/monobank",
    title: "Як підʼєднати Monobank до трекера витрат",
    teaser: "Що робить персональний токен і що він бачить.",
  },
  {
    href: "/guides/cheky",
    title: "Як сканувати чеки у витрати, якщо QR не працює",
    teaser: "Як зняти чек, щоб рядки розпізналися.",
  },
  {
    href: "/guides/bank-bezpeka",
    title: "Чи безпечно давати застосунку доступ до банку",
    teaser: "Сім питань до будь-якого сервісу перед підключенням.",
  },
];

export default function HroshiPage() {
  usePageMeta({
    ...ROUTE_META["/hroshi"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Облік витрат без ручного вводу кожної покупки",
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
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-finyk">
        Модуль · Фінік
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Облік витрат без ручного вводу кожної покупки
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        У Фініку чотири входи витрат, і жоден із них не головний. Банк присилає
        операції сам. Паперовий чек стає витратою з фотографії, виписку іншого
        банку можна завантажити файлом. Руками лишається те, на що немає ні
        чека, ні виписки.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Чотири входи, а не один банк</h2>
        <p className={body}>
          Коли трекер будує весь досвід навколо підключення банку, людина без
          цього банку впирається в логін-екран. У Фініку банківський і ручний
          режим рівноправні: якщо банк не підключено, зʼявляється неблокуючий
          банер із двома рівними діями. «Без банку продовжити» можна натиснути й
          ніколи не повертатись до першої.
        </p>
        <div className="mt-8 grid gap-px bg-cardline-strong sm:grid-cols-2">
          {ENTRIES.map((entry) => (
            <div key={entry.n} className="bg-background p-6">
              <p className="font-display text-sm font-bold text-subtle">
                {entry.n}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-tight text-foreground-strong">
                {entry.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {entry.text}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          Усі чотири входи ведуть в одну стрічку операцій. Категорію, розподіл і
          видимість будь-якої з них можна змінити руками, і твій вибір перебиває
          вгадування.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що бачить токен Monobank і чого він не може</h2>
        <p className={body}>
          Токен ти створюєш сам на api.monobank.ua і сам його відкликаєш – там
          же, одним кліком. У коді Фініка він ходить у три місця. Два з них
          читають: список рахунків і виписка. Третє – реєстрація вебхука: це
          запис, але записується рівно одне, адреса, на яку Monobank надсилатиме
          нові транзакції. Рухати гроші токен не може взагалі: у персональному
          API немає ендпоінта переказу, тож справа не в тому, що Фінік ним не
          користується.
        </p>
        <div className="mt-8 max-w-2xl">
          <MonoAccessTable />
        </div>
        <p className="mt-4 text-sm text-subtle">
          Детальний розбір –{" "}
          <a
            href="/guides/monobank"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            у гайді про підключення Monobank
          </a>
          .
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чек: фото, чернетка, екран перевірки</h2>
        <p className={body}>
          Чек – єдине джерело того, що саме ти купив. Тому шлях від паперу до
          витрати збудований так, щоб нічого не потрапило в журнал без твого
          «Зберегти».
        </p>
        <ol className="mt-8 flex flex-col gap-5">
          {RECEIPT_STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-cardline pt-4">
              <p className="font-display text-sm font-bold text-subtle">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-lg font-bold text-foreground-strong">
                {step.title}
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                {step.text}
              </p>
            </li>
          ))}
        </ol>
        <h3 className={h3}>Три деталі, які помітно на практиці</h3>
        <ul className="mt-4 flex max-w-2xl flex-col gap-3">
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">Пачкою.</strong>{" "}
            «Сканувати чек» приймає одне фото чи кілька: два і більше
            відкривають список до десяти чеків за раз. Кожен чек із пачки
            розгортається в той самий повний екран перевірки.
          </li>
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">
              Повтор не дублює.
            </strong>{" "}
            Той самий фіскальний чек, засканований удруге, нової витрати не
            створює.
          </li>
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">
              Порожня чернетка не збережеться сама.
            </strong>{" "}
            Якщо на фото не розпізналось жодне поле, чернетка отримує бейдж і
            виключається зі збереження автоматично.
          </li>
        </ul>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Виписка файлом</h2>
        <p className={body}>
          Формат визначається не за розширенням, а за вмістом файлу, і кодування
          теж: банківські CSV регулярно приїжджають у windows-1251, і без цього
          кирилиця перетворювалась на сміття ще до розбору. Окремий випадок –
          файл, який банк віддає під іменем .xls, а всередині там HTML-таблиця.
        </p>
        <ul className="mt-6 flex max-w-2xl flex-col gap-2.5">
          {FORMATS.map((format) => (
            <li
              key={format}
              className="flex items-baseline gap-2.5 text-sm leading-relaxed text-muted"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
              />
              {format}
            </li>
          ))}
        </ul>
        <h3 className={h3}>Категорія приїжджає вже заповненою</h3>
        <p className={body}>
          Рядок імпорту отримує підказку категорії з трьох шарів доказів: власна
          колонка «Категорія» у виписці, код MCC і ключові слова в описі
          мерчанта. Немає жодного доказу – підказки не буде: вгадувати навмання
          гірше, ніж мовчати. На живій виписці Privat24 із 27 рядків із
          категорією приїхали 23. Це один замір на одному файлі, не обіцянка
          точності.
        </p>
        <h3 className={h3}>Що робить із дублями</h3>
        <p className={body}>
          Перед збереженням кожен рядок звіряється з тим, що вже лежить у
          витратах – за датою, сумою і напрямом, без огляду на опис. Збіг
          отримує бейдж «схоже, вже є» і зняту галочку: рішення лишається за
          тобою, автоматично нічого не викидається. Якщо все одно вийшло не так
          – імпорт відкочується цілим батчем.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Коли синк мовчить, Фінік каже факт, а не діагноз</h2>
        <p className={body}>
          Порожня стрічка операцій означає одне з двох: витрат справді не було
          або звʼязок із банком обірвався. Ззовні ці два стани виглядають
          однаково – обидва є просто відсутністю подій, і розрізнити їх наявними
          даними неможливо.
        </p>
        <p className={body}>
          Тому після семи днів без оновлень Фінік показує рівно перевірений
          факт: «Дані не оновлювались N днів», і пропонує перевірити підключення
          – дія, яка допомагає в обох випадках.
        </p>
        <p className="mt-5 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-subtle">
          Написати тут «Monobank не працює» було б вигадкою в половині випадків.
          Ця копія в продукті навмисно захищена тестом, щоб не зʼїхати в бік
          упевненого діагнозу.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Чого Фінік не робить</h2>
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
            src="/screens/finyk.webp"
            alt="Екран Фініка: денний ліміт, витрати і надходження за сьогодні"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Фінік: скільки можна витратити сьогодні. Справжній екран бети, дані
            з демо-режиму продукту.
          </figcaption>
        </figure>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Гайди про гроші</h2>
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
        <p className="mt-8 text-sm text-subtle">
          Як Фінік звʼязаний з рештою сфер –{" "}
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
