import TelegramCta from "./TelegramCta";
import { LogoMark } from "./Wordmark";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "../lib/analytics";

/** Стрілка звʼязку між парою модулів. */
function PairArrow() {
  return (
    <svg
      width="26"
      height="10"
      viewBox="0 0 26 10"
      fill="none"
      aria-hidden="true"
      className="stroke-subtle"
      strokeWidth="1.6"
    >
      <path d="M1 5 h22 m-5 -4 5 4 -5 4" />
    </svg>
  );
}

/**
 * Модулі – чотири кольорові блоки на повну ширину: акцент модуля тут
 * не декор, а сама поверхня (module-accent containment: колір живе лише
 * всередині свого блока). Кожен блок несе живий фрагмент даних різної
 * форми, а не сітку однакових карток (анти-слоп: accent-swap ≠ ідентичність).
 */
export function ModulesSection() {
  const label = "font-display text-xs font-medium uppercase tracking-[0.12em]";
  const title = "font-display text-2xl font-extrabold uppercase";
  const body = "mt-1.5 text-sm leading-relaxed";

  return (
    <section id="modules" className="scroll-mt-16">
      <div className="mx-auto w-full max-w-6xl px-5 pb-9 pt-16 sm:px-8">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance text-foreground-strong sm:text-3xl">
          Чотири модулі, один простір
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted">
          Кожен збирає сигнали без зайвого вводу: фінанси з Monobank і чеків,
          їжа фото чи сканером, звичка одним тапом.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex min-h-[280px] flex-col gap-1 bg-finyk px-6 py-7 text-ink-text">
          <p className={label}>01 · Гроші</p>
          <h3 className={title}>Фінік</h3>
          <p className={`${body} text-ink-text/90`}>
            Синк із Monobank і сканер чеків із фото. Бюджети в гривні, борги під
            контролем. Руками – хіба витрати без чека.
          </p>
          <div aria-hidden="true" className="mt-auto flex flex-col gap-2 pt-6">
            <div className="flex justify-between text-xs">
              <span className="font-semibold">Кафе і доставка</span>
              <span className="tabular-nums">
                1&nbsp;840 / 2&nbsp;500&#8239;₴
              </span>
            </div>
            <div className="h-1.5 bg-ink-text/25">
              <div className="h-1.5 w-[74%] bg-ink-text" />
            </div>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col gap-1 bg-fizruk px-6 py-7 text-ink-text">
          <p className={label}>02 · Тіло</p>
          <h3 className={title}>Фізрук</h3>
          <p className={`${body} text-ink-text/90`}>
            Плани тренувань, прогрес силових, вага і заміри. Підхід записується
            за пару тапів.
          </p>
          <div
            aria-hidden="true"
            className="mt-auto flex items-baseline gap-2.5 pt-6 tabular-nums"
          >
            <span className="text-xl font-bold">80 → 85 кг</span>
            <span className="text-xs text-ink-text/85">присід · 4 тижні</span>
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col gap-1 bg-routine px-6 py-7 text-ink">
          <p className={label}>03 · Звички</p>
          <h3 className={title}>Рутина</h3>
          <p className={`${body} text-ink/90`}>
            Стріки з чесною статистикою. Пропуск із причиною не обнуляє серію.
          </p>
          <div
            aria-hidden="true"
            className="mt-auto flex items-center gap-2 pt-6"
          >
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-3 w-3 rounded-full bg-ink" />
            ))}
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-ink" />
            {[4, 5].map((i) => (
              <span key={i} className="h-3 w-3 rounded-full bg-ink" />
            ))}
          </div>
        </div>

        <div className="flex min-h-[280px] flex-col gap-1 bg-nutrition-glow px-6 py-7 text-ink">
          <p className={label}>04 · Їжа</p>
          <h3 className={title}>Харчування</h3>
          <p className={`${body} text-ink/90`}>
            КБЖВ, фото страви, сканер штрихкодів і українська база продуктів.
          </p>
          <div
            aria-hidden="true"
            className="mt-auto flex items-baseline gap-3 pt-6 tabular-nums"
          >
            <span className="font-bold">Б 92</span>
            <span className="font-bold">Ж 61</span>
            <span className="font-bold">В 210</span>
            <span className="text-xs">1&nbsp;780 ккал</span>
          </div>
        </div>
      </div>
      <p className="mx-auto w-full max-w-6xl px-5 pt-3 text-xs text-subtle sm:px-8">
        Цифри на блоках ілюстративні
      </p>
    </section>
  );
}

/**
 * Справжні екрани бети (демо-режим продукту, знято з живого dev-стенда).
 * Найчастіше зауваження всіх зовнішніх рецензій: «лендінг без продукту».
 */
export function ScreensSection() {
  const screens = [
    {
      src: "/screens/hub.webp",
      alt: "Головний екран Sergeant: картки чотирьох модулів із даними дня і серією 14 днів",
      label: "Хаб: усі чотири сфери на одному екрані",
    },
    {
      src: "/screens/finyk.webp",
      alt: "Екран Фініка: денний ліміт 4 579 гривень, витрати і надходження за сьогодні",
      label: "Фінік: скільки можна витратити сьогодні",
    },
    {
      src: "/screens/nutrition.webp",
      alt: "Екран Їжі: кільце 1250 із 2200 ккал, білки, жири й вуглеводи, вода за день",
      label: "Їжа: КБЖВ і вода без таблиць",
    },
    {
      src: "/screens/routine.webp",
      alt: "Екран Рутини: 5 із 5 звичок виконано, серія 14 днів, тижнева стрічка",
      label: "Рутина: 5/5 за сьогодні, серія 14 днів",
    },
  ];

  return (
    <section
      id="screens"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 pt-16 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Як це виглядає
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Справжні екрани бети. Дані на них з демо-режиму продукту.
      </p>

      <div className="mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
        {screens.map((s, i) => (
          <figure
            key={s.src}
            className={`w-[240px] shrink-0 snap-start lg:w-auto ${
              i % 2 ? "lg:rotate-[0.8deg]" : "lg:-rotate-1"
            }`}
          >
            <img
              src={s.src}
              alt={s.alt}
              width={414}
              height={896}
              loading="lazy"
              className="paper-shadow w-full rounded-[var(--radius-card)] border border-cardline-strong bg-card"
            />
            <figcaption className="mt-2.5 text-xs text-subtle">
              {s.label}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/**
 * Звʼязки – «паперові» нотатки, ніби Sergeant лишив їх на столі. Третя
 * нотатка навмисно порожня формою (пунктир, без тіні): право мовчати,
 * коли закономірності немає – це чесність продукту, показана версткою.
 */
export function ConnectionsSection() {
  return (
    <section
      id="connections"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 pb-20 pt-16 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Звʼязки, які він помічає
      </h2>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Окремі трекери показують цифри. Sergeant читає всі сфери разом і
        показує, як вони впливають одна на одну.
      </p>

      <div className="mt-9 grid gap-6 lg:grid-cols-3">
        <figure className="paper-shadow flex -rotate-1 flex-col gap-3.5 rounded-[var(--radius-card)] bg-note p-6">
          <div
            aria-hidden="true"
            className="flex items-center gap-3 text-[13px] font-bold"
          >
            <span className="text-fizruk">Фізрук</span>
            <PairArrow />
            <span className="text-routine-strong">Рутина</span>
          </div>
          <blockquote className="font-serif text-lg italic leading-snug text-foreground">
            «У дні, коли тренуєшся зранку, інші звички зриваються рідше»
          </blockquote>
          <figcaption className="mt-auto text-xs text-subtle">
            тримається стабільно · 6 тижнів даних
          </figcaption>
        </figure>

        <figure className="paper-shadow flex rotate-[0.8deg] flex-col gap-3.5 rounded-[var(--radius-card)] bg-note p-6">
          <div
            aria-hidden="true"
            className="flex items-center gap-3 text-[13px] font-bold"
          >
            <span className="text-nutrition">Харчування</span>
            <PairArrow />
            <span className="text-routine-strong">Рутина</span>
          </div>
          <blockquote className="font-serif text-lg italic leading-snug text-foreground">
            «Коли снідаєш удома, ранкова рутина тримається довше»
          </blockquote>
          <figcaption className="mt-auto text-xs text-subtle">
            поки що збіг · 2 тижні даних
          </figcaption>
        </figure>

        <figure className="flex -rotate-[0.5deg] flex-col gap-3.5 rounded-[var(--radius-card)] border-2 border-dashed border-cardline-strong p-6">
          <div
            aria-hidden="true"
            className="flex items-center gap-3 text-[13px] font-bold"
          >
            <span className="text-finyk">Фінік</span>
            <PairArrow />
            <span className="text-fizruk">Фізрук</span>
          </div>
          <blockquote className="font-serif text-lg italic leading-snug text-subtle">
            «Закономірностей не помічено. Ще збираю дані»
          </blockquote>
          <figcaption className="sr-only">
            Звʼязок між Фініком і Фізруком ще не підтверджено
          </figcaption>
        </figure>
      </div>

      <p className="mt-7 max-w-2xl text-sm leading-relaxed text-subtle">
        Перші обережні спостереження зʼявляються вже за кілька днів спільних
        даних, впевненість росте з тижнями. Приклади ілюстративні: Sergeant
        будує висновки на твоїх даних і підписує кожен рівнем впевненості, а
        нижче порогу мовчить.
      </p>
    </section>
  );
}

/**
 * «Що обіцяю» – обіцянки фаундера за продукт у цілому, кожну можна
 * перевірити руками в застосунку (рішення 2026-08-30: без прикладів з
 * механіки одного модуля – пункти покривають усі сфери і AI-шар).
 */
export function PromisesSection() {
  const rules = [
    {
      n: "01",
      title: "Жодних нотацій",
      text: "Перевищений бюджет, пропущене тренування чи зірвана звичка – записи в статистиці. Sergeant рахує і показує, решту лишає тобі.",
      link: null,
    },
    {
      n: "02",
      title: "Висновки з доказами",
      text: "Кожен звʼязок підписаний рівнем впевненості і розгортається в дні, на яких порахований. Замало даних – тиша.",
      link: null,
    },
    {
      n: "03",
      title: "Нічого не записує мовчки",
      text: "Розпізнаний чек чи фото страви лягає чернеткою, яку ти підтверджуєш або правиш. Токен банку лише читає: заплатити ним неможливо.",
      link: { href: "/data", label: "Що саме бачить Sergeant →" },
    },
    {
      n: "04",
      title: "Забрати і стерти можна завжди",
      text: "Експорт усіх даних у JSON чи CSV одним кліком. Акаунт видаляєш сам, памʼять AI-помічника чистиш по одному запису. Нікому не продаються.",
      link: null,
    },
    {
      n: "05",
      title: "Ядро безкоштовне назавжди",
      text: "Модулі, ручний трекінг і підключення банку платними не стануть. Платне зверху: безлімітний AI, фото їжі, автосинк у фоні.",
      link: null,
    },
  ];

  return (
    <section
      id="promises"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 pb-16 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Що обіцяю
      </h2>
      <p className="mb-2 mt-3 max-w-xl leading-relaxed text-muted">
        Пʼять пунктів, за які мене можна тримати.
      </p>
      <div className="flex flex-col">
        {rules.map((rule) => (
          <div
            key={rule.n}
            className="grid gap-2 border-t-2 border-foreground-strong py-6 sm:grid-cols-[90px_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[90px_minmax(0,1fr)_360px]"
          >
            <span className="font-display text-sm font-bold text-subtle">
              {rule.n}
            </span>
            <h3 className="text-2xl font-bold leading-tight text-foreground-strong sm:text-[27px]">
              {rule.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted">
              {rule.text}
              {rule.link && (
                <>
                  {" "}
                  <a
                    href={rule.link.href}
                    className="font-semibold text-foreground underline decoration-cardline-strong underline-offset-4 transition hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    {rule.link.label}
                  </a>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Голос автора – місток довіри між статутом і станом розробки. */
export function FounderSection() {
  return (
    <section className="mx-auto w-full max-w-3xl border-t-2 border-foreground-strong px-5 py-14 sm:px-8">
      <div className="flex items-center gap-3">
        <LogoMark size={22} />
        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-2xl">
          Чому я це роблю
        </h2>
      </div>
      <p className="mt-4 leading-relaxed text-foreground">
        Я вів чотири застосунки паралельно: банк, тренування, звички, їжу. Кожен
        показував свої цифри, і жоден не бачив цілої картини. Sergeant я роблю
        для себе і таких, як я: чесна статистика і жодної торгівлі даними.
      </p>
      <p className="mt-4 font-serif italic text-subtle">– автор Sergeant</p>
    </section>
  );
}

/** Доповідь про стан – чесний список працює/в розробці. */
export function StatusSection() {
  const now = [
    "Автосинк фінансів через Monobank",
    "Сканер чеків із фото: поодинці й пачкою",
    "Чеки Сільпо підтягуються з програми лояльності",
    "Логи їжі, тренувань і звичок",
    "AI-помічник: спитай про свої дані в чаті",
    "Тижневий підсумок зі звʼязками між сферами",
  ];
  const soon = [
    "Глибша аналітика кореляцій",
    "Динамічні цілі, що підлаштовуються під тебе",
    "Мобільний застосунок",
  ];

  return (
    <section
      id="status"
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 py-16 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Доповідь про стан
      </h2>
      <p className="mt-4 max-w-xl leading-relaxed text-muted">
        Ось що працює сьогодні і що в розробці.
      </p>

      <div className="mt-9 grid gap-10 sm:grid-cols-2 sm:gap-14">
        <div>
          <h3 className="border-b-2 border-foreground-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-foreground-strong">
            Вже працює
          </h3>
          <ul className="mt-4 flex flex-col gap-4">
            {now.map((item) => (
              <li
                key={item}
                className="flex items-baseline gap-2.5 text-[15px] font-semibold leading-relaxed text-foreground"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 translate-y-px bg-foreground-strong"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="border-b-2 border-cardline-strong pb-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-subtle">
            У розробці
          </h3>
          <ul className="mt-4 flex flex-col gap-4">
            {soon.map((item) => (
              <li key={item} className="text-[15px] leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Питання й відповіді – одне джерело для розмітки сторінки і FAQPage JSON-LD. */
export const FAQ_ITEMS = [
  {
    q: "Чи потрібно вводити витрати руками?",
    a: "Ні. Картки синкаються з Monobank, готівку закриває фото чека. Руками – хіба те, на що чека немає.",
  },
  {
    q: "Що буде, якщо я пропущу день?",
    a: "Пропуск із причиною серію не ламає. Без причини стрік чесно перерветься, але історія і висновки нікуди не дінуться.",
  },
  {
    q: "Мої банківські дані бачить хтось, крім мене?",
    a: "Ні. Токен Monobank зберігається зашифрованим і читає лише транзакції. Я не продаю і не передаю твої дані нікому.",
  },
  {
    q: "Чи працює без підписки?",
    a: "Так. Ядро безкоштовне назавжди, AI-помічник у чаті має безкоштовний денний ліміт. Платний план відкриє безлімітний AI, фото-розпізнавання їжі, автосинк банку і PDF-звіти.",
  },
  {
    q: "Звідки Sergeant знає, що звʼязок справжній, а не збіг?",
    a: "Кожен звʼязок підписаний рівнем впевненості: від «поки що збіг» до «тримається стабільно». Поки даних менше порогу, Sergeant мовчить.",
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
      className="mx-auto w-full max-w-6xl scroll-mt-16 px-5 pb-20 sm:px-8"
    >
      <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-foreground-strong sm:text-3xl">
        Питання
      </h2>
      <div className="mt-6 grid gap-x-12 sm:grid-cols-2">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            name="faq"
            className="group border-t border-cardline"
            onToggle={(e) => {
              if (e.currentTarget.open)
                track(ANALYTICS_EVENTS.LANDING_FAQ_OPENED, {
                  question: item.q,
                  locale: LANDING_LOCALE,
                });
            }}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 font-bold text-foreground-strong transition hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
              <h3>{item.q}</h3>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="shrink-0 stroke-foreground-strong transition-transform group-open:rotate-45 motion-reduce:transition-none"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M8 2 v12 M2 8 h12" />
              </svg>
            </summary>
            <p className="max-w-2xl pb-5 text-sm leading-relaxed text-muted">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ClosingCta() {
  return (
    <section className="bg-ink text-ink-text">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-8 px-5 py-14 sm:px-8 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl font-extrabold uppercase tracking-tight text-balance sm:text-3xl">
            Бета відкривається хвилями
          </h2>
          <p className="max-w-lg leading-relaxed text-ink-muted">
            Стань у чергу в Telegram, і я напишу одне повідомлення, коли
            відкриється твоя.
          </p>
          <p className="text-sm text-ink-muted">
            Ядро безкоштовне назавжди · Твої дані залишаються твоїми
          </p>
        </div>
        <TelegramCta
          placement="footer"
          label="Стати в чергу"
          variant="inverse"
        />
      </div>
    </section>
  );
}
