import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_JSON_LD } from "../content/author";

/**
 * Сторінка-щеплення від розчарування: називає поіменно те, що лишається
 * руками навіть після підключення всієї автоматики. Числа тут відсутні
 * навмисно – заміру «економії часу» не існує, а вигадувати заборонено.
 */
const DAILY = [
  "Виправити категорію там, де вгадалось не так",
  "Підтвердити розпізнаний чек або страву",
  "Відмітити воду",
  "Відмітити звички або закрити день однією дією",
  "Ввести підходи тренування",
  "Записати вагу й заміри, коли міряєш",
];

export default function RuchnaRobotaPage() {
  usePageMeta({
    ...ROUTE_META["/ruchna-robota"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Скільки ручної роботи лишається в Sergeant",
      inLanguage: "uk",
      dateModified: ROUTE_META["/ruchna-robota"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
    },
  });

  const h2 =
    "font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl";
  const body = "mt-3 max-w-2xl leading-relaxed text-muted";
  const manual =
    "mt-4 max-w-2xl border-l-2 border-foreground-strong pl-5 text-sm leading-relaxed text-foreground";

  return (
    <SiteLayout mainClassName="mx-auto w-full max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
      <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.06] tracking-tight text-foreground-strong sm:text-5xl">
        Скільки ручної роботи лишається
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted">
        Менше, ніж у блокноті, і більше, ніж обіцяє реклама трекерів.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Ідеться про браузерну версію. Оновлено{" "}
        <UpdatedOn
          iso={ROUTE_META["/ruchna-robota"].lastmod}
          className="font-semibold"
        />
      </p>

      <section className="mt-14">
        <h2 className={h2}>Гроші: найбільше автоматики</h2>
        <p className={body}>
          Банк присилає операції сам, і кожна одразу отримує категорію за кодом
          операції й описом продавця. Якщо вгадати не вдалось, ставиться «Інше».
        </p>
        <p className={manual}>
          Тобі лишається виправити категорію, де вгадано не так.
        </p>
        <p className={body}>
          Чек із фото розпізнається з позиціями і зберігається лише після твого
          підтвердження. Пачка чеків перевіряється так само.
        </p>
        <p className={manual}>
          Не автоматизується: готівкова витрата, на яку немає чека. Сума й
          категорія руками.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Їжа: чотири входи, але зберігаєш ти</h2>
        <p className={body}>
          Пошук у базі, штрихкод, фото страви або ручний ввід. Перші три
          заповнюють поля за тебе. Повторну страву записуєш із картки, нічого не
          вводячи.
        </p>
        <p className={body}>
          Яйце, скибка хліба чи склянка молока вже мають вагу порції. Улюблені
          продукти видно в пошуку ще до першої літери.
        </p>
        <p className={manual}>
          Не автоматизується: вода. Один тап на порцію, розумних пляшок продукт
          не читає.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Звички: один тап, і є масова відмітка</h2>
        <p className={body}>
          Якщо все зроблено, день закривається однією дією.
        </p>
        <p className={body}>
          Звичка може відмітитись сама після тренування, виконаної цілі з води
          чи записаної витрати, лише за сьогодні й на тому самому пристрої.
        </p>
        <p className={manual}>
          Не автоматизується: усе інше. Продукт не вгадує за тебе, що ти
          сьогодні читав чи медитував.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Тренування: тут ручної роботи найбільше</h2>
        <p className={body}>
          Шаблон тренування зберігає вправи, але не ваги й повтори. Новий підхід
          приходить заповненим значеннями попереднього, порожній рядок одним
          тапом бере минулий раз. Підтверджуєш кожен підхід сам.
        </p>
        <p className={manual}>
          Не автоматизується: нова вага чи повтори і самопочуття кожного
          підходу. Заміри тіла теж руками: продукт не читає розумні ваги і не
          підключається до фітнес-сервісів.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Історія з іншого трекера: лише частково</h2>
        <p className={body}>
          Виписка банку завантажується файлом, і місяці витрат зʼявляються
          одразу. Журнал зі Strong переноситься файлом разом з історією ваги, і
          вправи звіряються з довідником. Для їжі і звичок імпорту немає і
          найближчим часом не планується.
        </p>
        <p className={body}>
          Найбільше часу забере перший тиждень, далі допомагають збережені
          страви й шаблони.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що лишається тобі щодня</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {DAILY.map((item) => (
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
        <p className="mt-8 text-sm text-subtle">
          Як влаштований кожен вхід –{" "}
          <a
            href="/hroshi"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Гроші
          </a>
          ,{" "}
          <a
            href="/yizha"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Їжа
          </a>
          ,{" "}
          <a
            href="/zvychky"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Звички
          </a>
          ,{" "}
          <a
            href="/trenuvannia"
            className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Тренування
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
