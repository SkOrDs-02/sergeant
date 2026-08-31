import SiteLayout from "../components/SiteLayout";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import TelegramCta from "../components/TelegramCta";

/**
 * Сторінка-щеплення від розчарування: називає поіменно те, що лишається
 * руками навіть після підключення всієї автоматики. Числа тут відсутні
 * навмисно – заміру «економії часу» не існує, а вигадувати заборонено.
 */
const DAILY = [
  "Виправити категорію там, де вгадалось не так",
  "Підтвердити розпізнаний чек або страву",
  "Відмітити воду",
  "Відмітити звички – або закрити день однією дією",
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
      dateModified: "2026-08-31",
      author: { "@type": "Person", name: "Автор Sergeant" },
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
        Чесна відповідь: менше, ніж у блокноті, і більше, ніж обіцяє реклама
        трекерів. Нижче поіменно: що продукт бере на себе, що лишає тобі й чого
        не автоматизує ніхто, включно з нами.
      </p>
      <p className="mt-3 text-sm text-subtle">
        Ідеться про браузерну версію – саме вона повна. Оновлено{" "}
        <time dateTime="2026-08-31" className="font-semibold">
          31 серпня 2026
        </time>
      </p>

      <section className="mt-14">
        <h2 className={h2}>Гроші: найбільше автоматики</h2>
        <p className={body}>
          Банк присилає операції сам, і кожна одразу отримує категорію: продукт
          читає код операції і опис мерчанта. Якщо доказів не вистачило,
          категорія стає «Інше» – не порожньою, але й не вгаданою навмання.
        </p>
        <p className={manual}>
          Тобі лишається переглянути й виправити те, що вгадалось не так. Не
          кожну операцію, а ті, де категорія має значення саме для тебе.
        </p>
        <p className={body}>
          Чек із фото розпізнається разом із позиціями, але зберігається лише
          після твого підтвердження. Це навмисна межа, а не недоробка: продукт
          не записує в журнал нічого, чого ти не бачив. Той самий екран
          перевірки відкривається і для пачки чеків.
        </p>
        <p className={manual}>
          Не автоматизується взагалі: готівкова витрата, на яку немає чека. Сума
          й категорія – руками.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Їжа: три входи, але зберігаєш ти</h2>
        <p className={body}>
          Штрихкод, фото страви або ручний ввід. Перші два заповнюють поля за
          тебе, але завершує запис завжди твій тап «Зберегти» – з тієї самої
          причини, що й із чеками. Повторна страва не потребує повторного вводу:
          збережена страва логується з картки.
        </p>
        <p className={manual}>
          Не автоматизується взагалі: вода. Один тап на порцію, але цей тап
          робиш ти, щодня. Розумних пляшок і зовнішніх джерел продукт не читає.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Звички: один тап, і є масова відмітка</h2>
        <p className={body}>
          Звичка перемикається одним тапом. Якщо день вийшов такий, що все
          зроблено, є масова відмітка дня – закрити одним рухом, а не перебирати
          список.
        </p>
        <p className={manual}>
          Не автоматизується взагалі: сама відмітка. Продукт не вгадує за тебе,
          що ти сьогодні читав чи медитував, і це не той випадок, коли
          вгадування було б доречним.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Тренування: тут ручної роботи найбільше</h2>
        <p className={body}>
          Чесно: це найтяжча ділянка. Шаблон тренування зберігає список вправ,
          але не ваги й повтори – кожен підхід вводиться заново, навіть другий
          підхід тієї самої вправи в тій самій сесії. Кнопки «повторити
          попередній підхід» сьогодні немає.
        </p>
        <p className={manual}>
          Не автоматизується взагалі: вага, повтори і самопочуття кожного
          підходу. Вимірювання тіла й вага – теж руками: продукт не читає
          розумні ваги і не підключається до зовнішніх фітнес-сервісів.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Історію з іншого трекера перенести не вийде</h2>
        <p className={body}>
          Виписку банку можна завантажити файлом і дістати місяці витрат одразу.
          Для тренувань, їжі й звичок такого немає: адаптерів до сторонніх
          трекерів у продукті не існує і найближчим часом не планується.
        </p>
        <p className={body}>
          Це означає, що перший тиждень буде найдорожчим за часом. Далі стає
          легше – але не тому, що зʼявиться автоматика, а тому, що зʼявляться
          збережені страви й шаблони.
        </p>
      </section>

      <section className="mt-14 border-t-2 border-foreground-strong pt-8">
        <h2 className={h2}>Що лишається тобі щодня</h2>
        <ul className="mt-6 flex max-w-2xl flex-col gap-3">
          {DAILY.map((item) => (
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
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-subtle">
          Це список, за яким можна вирішити «мені підходить» або «мені зайве» ще
          до реєстрації. Саме для цього він тут і стоїть.
        </p>
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
