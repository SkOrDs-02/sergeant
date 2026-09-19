import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_JSON_LD } from "../content/author";

/**
 * Єдина платна фіча продукту до 2026-09-15 не мала власної сторінки: «що
 * можна спитати», ліміт Free і куди їдуть дані були розкидані по FAQ, /data
 * і /obitsyanky. Ця сторінка збирає їх в одне питання людини: «а що я
 * можу в нього спитати і що це коштує». Ціна свідомо не називається: те
 * саме рішення, що зняло її з веб-копії до запуску.
 */
const ROUTE = "/pomichnyk";

const ASK = [
  {
    q: "Скільки я витратив цього тижня?",
    a: "Помічник дістає суми з Фініка і відповідає цифрою з твоїх операцій.",
  },
  {
    q: "Як мої тренування за місяць?",
    a: "Порівняє тижні, покаже прогрес по вправах і тоннаж із журналу Фізрука.",
  },
  {
    q: "Що я їв сьогодні і скільки це білка?",
    a: "Зведе записи Харчування за день і порахує КБЖВ з них.",
  },
  {
    q: "Стан моїх звичок",
    a: "Серії, пропуски з причиною і статистика Рутини за період.",
  },
];

const DO = [
  "Записати витрату чи дохід, розбити операцію, змінити категорію.",
  "Відмітити звичку, поставити її на паузу, змінити розклад.",
  "Записати вагу, воду, прийом їжі, підхід у тренуванні.",
  "Порівняти два періоди, знайти незвичні витрати, показати тренд.",
  "Поставити нагадування, зберегти нотатку, додати рецепт.",
];

const NOT = [
  "Не вигадує чисел. Кожна цифра у відповіді береться з твоїх даних або з результату інструмента; «приблизно» він не рахує.",
  "Не рахує звʼязки між сферами сам. Їх рахує код статистично, і помічник лише переказує готовий факт із рівнем впевненості.",
  "Не дає медичних і фінансових порад. Він показує твої власні цифри і звʼязки між ними.",
  "Не пише першим у безкоштовному плані. Проактивність, коли помічник сам починає розмову, є частиною платного плану.",
];

export default function PomichnykPage() {
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
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";
  const link =
    "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
        Поверх модулів
      </p>
      <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        AI-помічник
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Чат, який бачить твої гроші, тренування, звички і їжу разом. Питаєш
        своїми словами, він відповідає цифрами з твоїх записів і, якщо попросиш,
        записує нове. Безкоштовно пʼять запитів на добу.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Оновлено{" "}
        <UpdatedOn iso={ROUTE_META[ROUTE].lastmod} className="font-semibold" />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Що можна спитати</h2>
        <p className={body}>
          Чотири питання, які стоять підказками в порожньому чаті. Відповідь на
          кожне приходить з твоїх даних.
        </p>
        <div className="mt-8 grid gap-px bg-cardline-strong sm:grid-cols-2">
          {ASK.map((item) => (
            <div key={item.q} className="bg-background p-6">
              <h3 className="text-lg font-bold leading-tight text-foreground-strong">
                «{item.q}»
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className={h2}>Що можна попросити зробити</h2>
        <p className={body}>
          Помічник не лише читає. Оборотні дії виконуються одразу з кнопкою
          «скасувати»; перед незворотними, як-от видалення чи перезапис, він
          називає інструменти поіменно і чекає на підтвердження.
        </p>
        <ul className="mt-5 flex max-w-2xl flex-col gap-3">
          {DO.map((item) => (
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

      <section className="mt-14">
        <h2 className={h2}>Чого він не робить</h2>
        <ul className="mt-5 flex max-w-2xl flex-col gap-3">
          {NOT.map((item) => (
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
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
          Як рахуються звʼязки і чому нижче порогу продукт мовчить –{" "}
          <a href="/zvyazky" className={link}>
            на сторінці про звʼязки
          </a>
          .
        </p>
      </section>

      <section className="mt-14">
        <h2 className={h2}>Скільки це коштує</h2>
        <p className={body}>
          Ядро продукту безкоштовне назавжди, і помічник у ньому теж є: пʼять
          запитів на добу. Хід із дією рахується як один запит, а не два, тож
          пʼять запитів означають пʼять дій. Тижневий підсумок у цю квоту не
          входить.
        </p>
        <p className={body}>
          Платний план знімає денний ліміт і додає памʼять помічника,
          розпізнавання їжі з фото, автосинк банку у фоні і проактивність. Ціни
          тут поки немає: до відкриття бети вона може змінитись, а обіцяти
          число, яке зміниться, не хочу.
        </p>
      </section>

      <section className="mt-14">
        <h2 className={h2}>Куди їдуть твої слова</h2>
        <p className={body}>
          Повідомлення чату обробляє сторонній AI-провайдер. Перед відправкою
          вирізаються пошта, телефон, номер картки й IBAN; суми, категорії і
          назви крамниць ідуть як є, бо без них відповідь порожня. Памʼять
          помічника, тобто факти, які він запамʼятав про тебе, видно списком у
          налаштуваннях, і кожен запис видаляється окремо.
        </p>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-subtle">
          Повна картина доступів і сховища –{" "}
          <a href="/data" className={link}>
            на сторінці «Твої дані»
          </a>
          .
        </p>
      </section>

      <div className="mt-14 border-t-2 border-foreground-strong pt-8">
        <p className="max-w-2xl leading-relaxed text-muted">
          Що з цього вже працює, а що в розробці –{" "}
          <a href="/stan" className={link}>
            у доповіді про стан
          </a>
          .
        </p>
        <div className="mt-6">
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
      </div>
    </SiteLayout>
  );
}
