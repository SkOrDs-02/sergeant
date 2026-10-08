import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import ModuleFooterLinks from "../components/ModuleFooterLinks";
import { AUTHOR_JSON_LD } from "../content/author";
import { MOBILE_CLAIM } from "../content/mobileClaim";

/**
 * Модуль Фінік. Рішення фаундера 2026-08-30 (site-ia §10 п. 7): входів
 * чотири, а не три – чек і виписка рахуються окремо, бо це різні дії
 * людини з різним результатом.
 */
const ENTRIES = [
  {
    n: "01",
    title: "Банк присилає операції сам",
    text: "Monobank надсилає операцію, щойно вона сталась. Окремо є ручне довантаження за останній 31 день, щоб добрати те, що було до підключення. Інших банківських підключень у Фініку немає.",
  },
  {
    n: "02",
    title: "Чек стає витратою з фотографії",
    text: "Разом із позиціями: що куплено, по скільки і в якій кількості. Банк знає суму й магазин, рядки покупок є тільки на чеку.",
  },
  {
    n: "03",
    title: "Виписку можна завантажити файлом",
    text: "Якщо банк не дає автосинхронізації, але дає виписку, витрати за місяць заводяться одним файлом.",
  },
  {
    n: "04",
    title: "Руками, коли доказу немає",
    text: "Для витрати, від якої не лишилось ні чека, ні рядка у виписці. Назву можна не писати: у списку буде «Ручна витрата» з категорією з того самого каталогу, що й у банківських операцій.",
  },
];

const RECEIPT_STEPS = [
  {
    title: "Фото",
    text: "Знімаєш чек, розпізнавання дістає суму, дату і рядки покупок. Другий шлях, через QR фіскального чека і реєстр ДПС, вимкнено, поки доступ до реєстру обмежено на час воєнного стану.",
  },
  {
    title: "Чернетка",
    text: "Результат – чернетка з поміткою «перевір суми», ще не запис.",
  },
  {
    title: "Екран перевірки",
    text: "Обовʼязковий: без нього збереження не відбувається. Суму, дату, категорію і кожну позицію можна виправити.",
  },
  {
    title: "Запис",
    text: "Збережений чек шукає банківську операцію за сумою і датою в межах доби і привʼязується до неї. Якщо не знайшов, стає окремою ручною витратою.",
  },
];

const FORMATS = [
  "CSV, XLSX і файл із розширенням .xls читаються, навіть якщо всередині проста табличка з сайту банку, а не справжній Excel.",
  "PDF не читається: Фінік попросить узяти в банку той самий період у XLSX або CSV.",
  "Бінарний Excel 97 не читається: Фінік попросить перезберегти файл.",
];

const BOUNDARIES = [
  "Не рухає гроші: ні платежів, ні переказів.",
  "Не веде інвестиції: активи лишаються ручним списком вартостей, без котирувань.",
  "Не рахує ФОП: ні бізнес-обліку, ні податкової звітності.",
  "Автосинхронізація лише з Monobank. Інші банки заводяться випискою файлом або чеками.",
  "Позначка «в операції є чек» живе на пристрої: чек, засканований на телефоні, не підсвітить ту саму операцію на компʼютері.",
  MOBILE_CLAIM,
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
    href: "/guides/kilka-bankiv",
    title: "Як звести витрати докупи, якщо карти в кількох банках",
    teaser: "Автосинхронізація лише з Monobank, решта карт випискою файлом.",
  },
  {
    href: "/guides/pryvat24",
    title: "Як завести виписку Приват24 у трекер витрат",
    teaser: "Виписка файлом Excel або CSV.",
  },
  {
    href: "/guides/silpo",
    title: "Як бачити чек Сільпо по позиціях",
    teaser: "Позиції йдуть у категорії і комору.",
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
      dateModified: ROUTE_META["/hroshi"].lastmod,
      author: AUTHOR_JSON_LD,
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
        Модуль <span className="font-sans">·</span> Фінік
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
        <UpdatedOn
          iso={ROUTE_META["/hroshi"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Чотири входи</h2>
        <p className={body}>
          Без Monobank Фінік працює так само: чек, виписка і ручна форма банку
          не потребують. Підключити його можна пізніше або ніколи.
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
          Усі чотири входи ведуть в одну стрічку операцій. Категорію будь-якої з
          них можна змінити руками, і твій вибір перебиває вгадування.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що бачить токен Monobank і чого він не може</h2>
        <p className={body}>
          Токен ти створюєш сам на api.monobank.ua і там само відкликаєш. Він
          читає рахунки й виписку і повідомляє банку адресу, куди слати нові
          операції. Переказати гроші ним не можна: у персональному API Monobank
          такої дії немає.
        </p>
        <p className="mt-4 text-sm text-subtle">
          Таблиця «бачить / не може» і покрокове підключення –{" "}
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
          Чек – єдине джерело того, що саме ти купив, тому в журнал він
          потрапляє лише після твого «Зберегти».
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
        <h3 className={h3}>Що помітно на практиці</h3>
        <ul className="mt-4 flex max-w-2xl flex-col gap-3">
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">Пачкою.</strong>{" "}
            «Сканувати чек» приймає одне фото чи кілька: два і більше
            відкривають список до десяти чеків за раз, і кожен розгортається в
            той самий екран перевірки.
          </li>
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">Дублі.</strong> Той самий
            чек, сфотографований удруге, створить другу витрату: дублі Фінік
            ловить за фіскальним номером, а його дає лише QR, який зараз не
            читається.
          </li>
          <li className="text-sm leading-relaxed text-muted">
            <strong className="text-foreground-strong">
              Порожня чернетка.
            </strong>{" "}
            Якщо на фото не розпізналось жодне поле, чернетка дістає бейдж і не
            потрапляє у збереження.
          </li>
        </ul>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Виписка файлом</h2>
        <p className={body}>
          Формат визначається за вмістом файлу, розширення не має значення.
          Будь-який файл із кирилицею читається.
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
          Рядок імпорту отримує підказку категорії з трьох джерел: колонка
          «Категорія» у виписці, код категорії від банку і ключові слова в описі
          продавця. Без жодного з них підказки не буде: вгадувати навмання
          гірше, ніж мовчати. На живій виписці Приват24 із 27 рядків категорію
          дістали 23. Це один замір на одному файлі.
        </p>
        <h3 className={h3}>Що робить із дублями</h3>
        <p className={body}>
          Перед збереженням кожен рядок звіряється з тим, що вже лежить у
          витратах: за датою, сумою і напрямом. Збіг отримує бейдж «схоже, вже
          є» і зняту галочку, автоматично нічого не викидається. Якщо щось пішло
          не так, весь імпорт скасовується однією дією.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Коли синхронізація мовчить, Фінік каже лише факт</h2>
        <p className={body}>
          Порожня стрічка означає одне з двох: витрат не було або звʼязок із
          банком обірвався. Розрізнити це неможливо, тому після семи днів тиші
          Фінік каже лише те, що знає: «Дані не оновлювались N днів», і пропонує
          перевірити підключення.
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
            alt="Екран Фініка: бюджет дня, витрати і надходження за сьогодні"
            width={414}
            height={896}
            loading="lazy"
            className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
          />
          <figcaption className="mt-2.5 text-xs text-subtle">
            Фінік: скільки можна витратити сьогодні. Екран бети з демо-даними.
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
        <ModuleFooterLinks />
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </section>
    </SiteLayout>
  );
}
