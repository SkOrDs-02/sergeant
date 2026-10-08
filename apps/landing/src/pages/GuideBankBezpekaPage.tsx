import type { ReactNode } from "react";
import SiteLayout from "../components/SiteLayout";
import GuideHomeModule from "../components/GuideHomeModule";
import { ROUTE_META, usePageMeta } from "../lib/pageMeta";
import UpdatedOn from "../components/UpdatedOn";
import TelegramCta from "../components/TelegramCta";
import { EXPORT_CLAIM } from "../content/exportClaim";
import { NO_SALE_CLAIM } from "../content/noSaleClaim";
import { AUTHOR_NAME, AUTHOR_JSON_LD } from "../content/author";

const link =
  "font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Чек-лист загальний, відповідь Sergeant стоїть одразу під кожним питанням –
 * так сторінка читається і як гайд про токени взагалі, і як розбір Sergeant.
 */
const QA: { q: string; why: string; sergeant: ReactNode }[] = [
  {
    q: "Читання чи повний доступ",
    why: "Читати виписку і рухати гроші: це різні права. Питання формулюється жорстко: чи зможе зловмисник рухати гроші, якщо зламає цей сервіс завтра.",
    sergeant:
      "Лише читання. Персональний токен Monobank не має способу рухати гроші: платіжних методів у цьому API немає. Єдина команда, яку трекер ним подає, це реєстрація адреси, на яку банк надсилатиме нові операції.",
  },
  {
    q: "Офіційний API чи логін від банку",
    why: "Банк видає токен тобі й сам обмежує його права. Логін і пароль від банку не варто давати нікому й ніколи, і жодні обіцянки сервісу цього не вирівнюють.",
    sergeant:
      "Офіційний API Monobank. Логін і пароль тут не фігурують, токен зберігається зашифрованим.",
  },
  {
    q: "Хто керує відкликанням",
    why: "Добре, коли доступ вимикається на сайті банку: рішення лишається в тебе. Гірше, коли його знімають лише через підтримку сервісу, бо тоді швидкість залежить від чужої черги звернень.",
    sergeant:
      "Один клік на api.monobank.ua. Без підтримки, без пояснень і без згоди Sergeant.",
  },
  {
    q: "Де сервери і хто оператор",
    why: "Юрисдикція визначає правила поводження з даними, а імʼя оператора має бути написане на сайті звичайним текстом.",
    sergeant: `Сервери в Європі (Hetzner). Продукт робить одна людина, ${AUTHOR_NAME}; юридичної особи поки немає, про це на сторінці «Звʼязок». Частина даних живе локально на твоєму пристрої. ${NO_SALE_CLAIM}; щоб працював Сержант, частина даних їде до стороннього AI-провайдера.`,
  },
  {
    q: "Чи можна забрати свої дані",
    why: "Експорт у стандартні формати страхує на всі випадки: переїзд, підозра, закриття сервісу. Питай саме про формат, бо «доступ до даних» буває й через скриншот.",
    sergeant: EXPORT_CLAIM,
  },
  {
    q: "Що сервіс бачить, а що ні",
    why: "Добра відповідь називає конкретні поля. Фраза «все зашифровано» відповіддю не є.",
    sergeant: (
      <>
        Операції, код категорії від банку, баланс. Номер картки і CVV токен не
        віддає. Розбір по полях – у{" "}
        <a href="/guides/monobank" className={link}>
          гайді про підключення
        </a>
        , решта доступів і сховище – на сторінці{" "}
        <a href="/data" className={link}>
          «Твої дані»
        </a>
        .
      </>
    ),
  },
  {
    q: "Що буде, якщо сервіс закриється",
    why: "Питання незручне, тому його й варто поставити. Хороша відповідь звучить приблизно так: експорт у тебе вже є, і доступ ти знімаєш сам на боці банку.",
    sergeant:
      "Саме так: експорт уже в тебе, токен знімаєш сам у Monobank за хвилину.",
  },
];

const LEAK_STEPS = [
  "Зміни пароль у банку просто зараз, до всього іншого.",
  "Перевір у банку список активних сесій, пристроїв і виданих токенів; познімай ті, яких не впізнаєш.",
  "Переглянь операції за останній місяць і ввімкни сповіщення про кожну, якщо вони були вимкнені.",
];

const SHORT_ANSWER =
  "Безпечно тоді, коли доступ читає й тільки читає, виданий через офіційний API банку, і відкликаєш ти його сам за один клік. Ризиковано тоді, коли сервіс просить логін і пароль від банку: це доступ до всього, включно з переказами, і забрати його можна хіба що зміною пароля. Нижче сім питань, які працюють для будь-якого сервісу, і одразу під кожним стоїть відповідь Sergeant.";

export default function GuideBankBezpekaPage() {
  usePageMeta({
    ...ROUTE_META["/guides/bank-bezpeka"],
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline:
        "Чи безпечно давати застосунку доступ до банку: що перевірити перед підключенням",
      inLanguage: "uk",
      dateModified: ROUTE_META["/guides/bank-bezpeka"].lastmod,
      author: AUTHOR_JSON_LD,
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
            Гайди · Фінанси
          </p>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.12] tracking-tight text-balance text-foreground-strong sm:text-4xl">
            Чи безпечно давати застосунку доступ до банку: що перевірити перед
            підключенням
          </h1>
          <p className="mt-4 text-sm text-subtle">
            Оновлено{" "}
            <UpdatedOn iso={ROUTE_META["/guides/bank-bezpeka"].lastmod} /> ·{" "}
            {AUTHOR_NAME}
          </p>
          <GuideHomeModule href="/data" label="Твої дані" />
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
          <h2 className={h2}>Сім питань і відповіді Sergeant</h2>
          <ol className="mt-6 flex flex-col border-b border-cardline">
            {QA.map((item, i) => (
              <li key={item.q} className="border-t border-cardline py-5">
                <p className="font-bold text-foreground-strong">
                  {i + 1}. {item.q}
                </p>
                <p className="mt-1.5 leading-relaxed text-foreground">
                  {item.why}
                </p>
                <p className="mt-3 border-l-2 border-ink pl-4 text-sm leading-relaxed text-muted">
                  <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-foreground-strong">
                    Sergeant:
                  </span>{" "}
                  {item.sergeant}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-2xl leading-relaxed text-foreground">
            Зовнішнього аудиту й сертифікатів на кшталт ISO у Sergeant немає:
            продукт у закритій беті, роблю його сам. З банків підключений лише
            Monobank, ПриватБанку поки немає. Перевіряти взагалі варто те, що
            можна перевірити самому: рівень доступу, кнопку відкликання на сайті
            банку і наявність експорту.
          </p>
        </section>

        <section>
          <h2 className={h2}>Якщо логін від банку кудись уже пішов</h2>
          <ol className="mt-5 flex flex-col gap-3.5">
            {LEAK_STEPS.map((step, i) => (
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
          <p className="mt-4 max-w-2xl leading-relaxed text-foreground">
            Цей самий порядок дій підходить і тоді, коли ти просто передумав
            щодо сервісу, якому колись дав токен. Відкликання на боці банку
            працює миттєво й не потребує згоди того, кому ти токен давав.
          </p>
        </section>

        <section>
          <p className="text-sm text-subtle">
            Що застосунок бачить і чого не бачить –{" "}
            <a href="/data" className={link}>
              на сторінці «Твої дані»
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
