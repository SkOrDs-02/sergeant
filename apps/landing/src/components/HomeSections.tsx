import DashboardPreview from "./DashboardPreview";
import TelegramCta from "./TelegramCta";

/**
 * Модулі — рядки з живими фрагментами даних різної форми, а не сітка
 * карток, що різняться лише hue (анти-слоп: accent-swap ≠ ідентичність).
 * Кольори модуля живуть лише в його рядку (module-accent containment).
 */
export function ModulesSection() {
  const rowGrid =
    "grid gap-4 border-t border-cardline py-6 sm:grid-cols-[180px_minmax(0,1fr)_300px] sm:items-center sm:gap-10";

  return (
    <section
      id="modules"
      className="mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-24"
    >
      <h2 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Чотири модулі, один простір
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Кожен збирає сигнали без зайвого вводу: фінанси підтягуються з Monobank,
        їжа – фото чи сканером, звичка – одним тапом.
      </p>

      <div className="mt-10 border-b border-cardline">
        <div className={rowGrid}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Гроші
            </p>
            <h3 className="mt-0.5 font-display text-2xl font-bold text-finyk">
              Фінік
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            Бюджети в гривні, синк із Monobank, категорії та борги без ручного
            вводу.
          </p>
          <div aria-hidden="true" className="flex flex-col gap-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-foreground">
                Кафе і доставка
              </span>
              <span className="text-muted">
                1&nbsp;840 / 2&nbsp;500&#8239;₴
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-finyk-soft">
              <div className="h-1.5 w-[74%] rounded-full bg-finyk" />
            </div>
          </div>
        </div>

        <div className={rowGrid}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Тіло
            </p>
            <h3 className="mt-0.5 font-display text-2xl font-bold text-fizruk">
              Фізрук
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            Плани тренувань, прогрес силових і біометрія в одному місці.
          </p>
          <div
            aria-hidden="true"
            className="flex items-baseline gap-2.5 tabular-nums"
          >
            <span className="text-xs font-semibold text-foreground">
              Присід
            </span>
            <span className="text-lg font-bold text-fizruk">80 → 85 кг</span>
            <span className="text-xs text-muted">за 4 тижні</span>
          </div>
        </div>

        <div className={rowGrid}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Звички
            </p>
            <h3 className="mt-0.5 font-display text-2xl font-bold text-routine">
              Рутина
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            Стріки й чек-іни з чесною статистикою. Пропуск – це подія з
            причиною, а не обнулення.
          </p>
          <div aria-hidden="true" className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full bg-routine" />
            ))}
            <span className="h-3.5 w-3.5 rounded-full border-2 border-dashed border-routine" />
            {[4, 5].map((i) => (
              <span key={i} className="h-3.5 w-3.5 rounded-full bg-routine" />
            ))}
            <span className="ml-1 text-xs text-muted">
              пауза з причиною – не зрив
            </span>
          </div>
        </div>

        <div className={rowGrid}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
              Їжа
            </p>
            <h3 className="mt-0.5 font-display text-2xl font-bold text-nutrition">
              Харчування
            </h3>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            КБЖУ, сканер штрих-кодів і українська база продуктів.
          </p>
          <div
            aria-hidden="true"
            className="flex items-baseline gap-3 tabular-nums"
          >
            <span className="text-xs text-muted">Сьогодні</span>
            <span className="text-sm font-bold text-nutrition">Б 92</span>
            <span className="text-sm font-bold text-nutrition">Ж 61</span>
            <span className="text-sm font-bold text-nutrition">В 210</span>
            <span className="text-xs text-muted">1&nbsp;780 ккал</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Довіра до даних — три обіцянки, за які продукт відповідає. */
export function TrustSection() {
  return (
    <section
      id="data"
      className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 sm:pb-24"
    >
      <h2 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Твої дані залишаються твоїми
      </h2>
      <div className="mt-8 max-w-4xl border-b border-cardline">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-cardline py-5">
          <p className="font-semibold text-foreground-strong">
            Токен Monobank – лише читання. Рухати гроші він фізично не може.
          </p>
          <a
            href="/guides/monobank"
            className="text-sm text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Що саме бачить трекер →
          </a>
        </div>
        <p className="border-t border-cardline py-5 font-semibold text-foreground-strong">
          Експорт у стандартні формати – в один клік, без листів у підтримку.
        </p>
        <p className="border-t border-cardline py-5 font-semibold text-foreground-strong">
          Я не продаю і не передаю твої дані нікому.
        </p>
      </div>
    </section>
  );
}

/**
 * Чорнильна секція звʼязків. Кожен інсайт несе градацію впевненості —
 * включно з правом мовчати, коли закономірності немає: це і є чесність
 * продукту, показана формою.
 */
export function ConnectionsSection() {
  const links = [
    {
      a: { label: "Фізрук", color: "text-fizruk-glow" },
      b: { label: "Рутина", color: "text-routine-glow" },
      insight: "У дні, коли тренуєшся зранку, інші звички зриваються рідше.",
      meta: "тримається стабільно · 6 тижнів даних",
      quiet: false,
    },
    {
      a: { label: "Харчування", color: "text-nutrition-glow" },
      b: { label: "Рутина", color: "text-routine-glow" },
      insight:
        "Коли снідаєш удома, ранкова рутина тримається довше, а зриви трапляються рідше.",
      meta: "поки що збіг · 2 тижні даних",
      quiet: false,
    },
    {
      a: { label: "Фінік", color: "text-finyk-glow" },
      b: { label: "Фізрук", color: "text-fizruk-glow" },
      insight: "Закономірностей не помічено. Ще збираю дані.",
      meta: null,
      quiet: true,
    },
  ];

  return (
    <section id="connections" className="bg-ink py-20 sm:py-24">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-3xl font-display text-3xl font-bold tracking-tight text-balance text-ink-text sm:text-4xl">
          Окремі трекери показують цифри. Sergeant показує звʼязки
        </h2>

        <div className="mt-12 flex max-w-4xl flex-col">
          {links.map((link) => (
            <figure
              key={link.insight}
              className="border-t border-ink-line py-7 first:border-t-0"
            >
              <div
                aria-hidden="true"
                className="flex items-center gap-3.5 text-sm font-semibold"
              >
                <span className={link.a.color}>{link.a.label}</span>
                <svg
                  width="26"
                  height="10"
                  viewBox="0 0 26 10"
                  fill="none"
                  className="stroke-ink-muted"
                  strokeWidth="1.6"
                >
                  <path d="M1 5 h22 m-5 -4 5 4 -5 4" />
                </svg>
                <span className={link.b.color}>{link.b.label}</span>
              </div>
              <blockquote
                className={`mt-4 max-w-3xl font-display text-xl font-medium leading-snug text-balance sm:text-2xl ${
                  link.quiet ? "text-ink-muted" : "text-ink-text"
                }`}
              >
                {link.insight}
              </blockquote>
              {link.meta && (
                <p className="mt-2.5 text-xs text-ink-muted">{link.meta}</p>
              )}
              <figcaption className="sr-only">
                Звʼязок між модулями {link.a.label} і {link.b.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-10 max-w-4xl">
          <DashboardPreview />
          <p className="mt-3 text-xs text-ink-muted">
            Приклад тижневого підсумку в Sergeant
          </p>
        </div>

        <div className="mt-12 max-w-xl border-t border-ink-line pt-7">
          <p className="text-sm font-semibold text-ink-text">
            Перше спостереження – приблизно після 14 днів даних.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Приклади ілюстративні. Sergeant будує висновки на твоїх даних і
            показує лише ті, в яких достатньо впевнений. Якщо впевненості нема,
            мовчить.
          </p>
        </div>
      </div>
    </section>
  );
}

export function HonestSection() {
  const now = [
    "Автосинк фінансів через Monobank",
    "Логи їжі, тренувань і звичок",
    "Тижневий підсумок зі звʼязками між сферами",
  ];
  const soon = [
    "Глибша аналітика кореляцій",
    "Динамічні цілі, що підлаштовуються під тебе",
    "Більше джерел даних поза Monobank",
  ];

  return (
    <section
      id="status"
      className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24"
    >
      <h2 className="max-w-lg font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Що вже працює, а що ще ні
      </h2>
      <p className="mt-4 max-w-xl leading-relaxed text-muted">
        Sergeant не обіцяє магію. Він показує звʼязки з тією впевненістю, яку
        реально має.
      </p>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-14">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-strong">
            Вже працює
          </h3>
          <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
            {now.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-sm font-semibold leading-relaxed text-foreground-strong"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0 translate-y-0.5 stroke-ink"
                  strokeWidth="2.6"
                >
                  <path d="M4 10.5 8.2 15 16 5.5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-subtle">
            У розробці
          </h3>
          <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
            {soon.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Питання й відповіді — одне джерело для розмітки сторінки і FAQPage JSON-LD. */
export const FAQ_ITEMS = [
  {
    q: "Чи потрібно вводити витрати руками?",
    a: "Ні. Фінанси синкаються з Monobank автоматично. Руками – хіба готівку, якщо хочеш повну картину.",
  },
  {
    q: "Що буде, якщо я пропущу день?",
    a: "Стрік чесно перерветься, але історія і висновки нікуди не дінуться. Sergeant не карає, він рахує.",
  },
  {
    q: "Мої банківські дані бачить хтось, крім мене?",
    a: "Ні. Токен Monobank зберігається зашифрованим і читає лише транзакції. Я не продаю і не передаю твої дані нікому.",
  },
  {
    q: "Чи працює без підписки?",
    a: "Так. Ядро і банк-синк безкоштовні назавжди. Платною буде лише глибша аналітика поверх твоїх даних.",
  },
  {
    q: "Звідки Sergeant знає, що звʼязок справжній, а не збіг?",
    a: "Він показує лише звʼязки, в яких статистично впевнений. Коли даних замало, мовчить, а не вигадує.",
  },
  {
    q: "Чи можна забрати свої дані?",
    a: "Так. Експорт у стандартні формати – в один клік, без листів у підтримку.",
  },
  {
    q: "На чому працює Sergeant?",
    a: "У браузері: на телефоні й компʼютері. Мобільний застосунок у розробці і зʼявиться пізніше.",
  },
];

export function FaqSection() {
  return (
    <section
      id="faq"
      className="mx-auto grid w-full max-w-6xl gap-8 px-5 pb-20 sm:px-8 sm:pb-24 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-16"
    >
      <h2 className="font-display text-3xl font-bold tracking-tight text-foreground-strong sm:text-4xl">
        Часті питання
      </h2>
      <div className="border-b border-cardline">
        {FAQ_ITEMS.map((item) => (
          <div key={item.q} className="border-t border-cardline py-5">
            <h3 className="font-display text-lg font-bold text-foreground-strong">
              {item.q}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {item.a}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="mx-auto w-full max-w-6xl border-t border-cardline px-5 pb-24 pt-16 sm:px-8">
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Бета відкривається хвилями
      </h2>
      <p className="mt-4 max-w-lg leading-relaxed text-pretty text-muted">
        Стань у чергу, і я напишу одне повідомлення, коли відкриється твоя.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <div>
          <TelegramCta placement="footer" label="Стати в чергу" />
        </div>
        <p className="text-sm text-muted">
          Ядро безкоштовне назавжди · Твої дані залишаються твоїми
        </p>
      </div>
    </section>
  );
}
