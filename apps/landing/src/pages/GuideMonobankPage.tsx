import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import MonoAccessTable from "../components/MonoAccessTable";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

const STEPS = [
  "Відкрий api.monobank.ua і авторизуйся через застосунок банку: QR-кодом, як звичайний вхід.",
  "Скопіюй персональний токен. Він виглядає як довгий рядок літер: це і є твій ключ «лише читання».",
  "Встав токен у трекер. Перше вивантаження йде по одному рахунку за раз, бо банк дозволяє один запит на хвилину, тож на кілька карток і банок піде кілька хвилин. Далі синк працює сам.",
];

const SHORT_ANSWER =
  "Monobank віддає трекеру виписку через персональний токен, який ти створюєш сам за хвилину. Токен лише читає дані: транзакції, категорії MCC і баланс. Рухати гроші чи бачити повний номер картки він фізично не може.";

export default function GuideMonobankPage() {
  usePageMeta({
    ...ROUTE_META["/guides/monobank"],
    jsonLd: {
      "@context": "https://schema.org",
      // HowTo, а не Article: сторінка веде людину по кроках, і саме кроки
      // мають бути машинно-читабельними. Розширених сніпетів Google для
      // HowTo більше не малює (зняв у вересні 2023), тож адресат тут –
      // AI-споживачі, ті самі, заради яких у нас llms.txt і markdown.
      "@type": "HowTo",
      name: "Як підʼєднати Monobank до трекера витрат – і що він реально бачить",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/monobank"].lastmod,
      author: AUTHOR_JSON_LD,
      publisher: { "@type": "Organization", name: "Sergeant" },
      step: STEPS.map((text, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        text,
      })),
    },
  });

  const h2 =
    "font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl";

  return (
    <SiteLayout>
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <div>
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-subtle">
            Гайди · Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Як підʼєднати Monobank до трекера витрат – і що він реально бачить
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено <UpdatedOn iso={ROUTE_META["/guides/monobank"].lastmod} />{" "}
            · {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/hroshi" label="Гроші" />
        </div>

        <div className="rounded-[var(--radius-card)] bg-ink px-7 py-6">
          <p className="font-display text-xs font-medium uppercase tracking-[0.12em] text-ink-muted">
            Коротка відповідь
          </p>
          <p className="mt-2.5 font-semibold leading-relaxed text-ink-text">
            {SHORT_ANSWER}
          </p>
        </div>

        <section>
          <h2 className={h2}>Що саме бачить трекер</h2>
          <div className="mt-5">
            <MonoAccessTable />
          </div>
        </section>

        <section>
          <h2 className={h2}>Як підʼєднати за три кроки</h2>
          <ol className="mt-5 flex flex-col gap-3.5">
            {STEPS.map((step, i) => (
              <li
                key={i}
                className="flex gap-4 leading-relaxed text-foreground"
              >
                <span className="shrink-0 font-bold text-foreground-strong">
                  {i + 1}.
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className={h2}>Скільки історії приїжджає одразу</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            На старті трекер забирає виписку за останній місяць по кожному
            рахунку. Це достатньо, щоб перший же тиждень мав із чим
            порівнюватись, і водночас не перетворює підключення на довге
            чекання. Глибша історія за кілька років одним махом не тягнеться:
            банк віддає її вікнами, по одному запиту на хвилину.
          </p>
        </section>

        <section>
          <h2 className={h2}>Коли витрата зʼявляється в трекері</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Після підключення банк сам надсилає кожну нову операцію, щойно вона
            сталась. Це не опитування раз на годину: трекер нічого не питає, а
            отримує. На практиці покупка лягає у стрічку витрат, поки ти ще не
            вийшов із магазину.
          </p>
        </section>

        <section>
          <h2 className={h2}>Кілька карток і банки</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Один токен відкриває всі рахунки цього клієнта, включно з банками.
            Кожен рахунок лишається окремим: гривнева картка, валютна і банка на
            відпустку не змішуються в одну купу. Перше вивантаження йде по
            одному рахунку за раз через той самий хвилинний ліміт, тож на кілька
            карток піде кілька хвилин, і це одноразово.
          </p>
        </section>

        <section>
          <h2 className={h2}>Звідки береться категорія витрати</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Банк передає код торговця, і саме він стає першим доказом категорії.
            Там, де коду мало, працюють правила за описом операції. Будь-яку
            підказку можна змінити, і жодна не вирішує остаточно: супермаркетний
            чек, наприклад, ділиться на реальні категорії вже окремо.
          </p>
        </section>

        <section>
          <h2 className={h2}>Якщо передумаєш</h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Токен відкликається в один клік на тій самій сторінці
            api.monobank.ua. Після цього жоден сервіс, якому ти його давав,
            більше не бачить нічого: контроль лишається в тебе.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            З боку трекера є симетрична дія: відключення знімає підписку на нові
            операції і стирає дані самого зʼєднання, зокрема токен. Уже
            завантажені витрати лишаються твоїми записами, бо вони вже частина
            історії, а не власність банку.
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Якщо синк колись зупиниться, найчастіша причина одна: токен
            відкликаний на боці банку. Лікується тим самим шляхом, яким
            підключався: новий токен на api.monobank.ua замість старого.
          </p>
        </section>

        <section>
          <p className="text-sm text-subtle">
            Усі входи витрат Фініка –{" "}
            <a
              href="/hroshi"
              className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              на сторінці про гроші
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
