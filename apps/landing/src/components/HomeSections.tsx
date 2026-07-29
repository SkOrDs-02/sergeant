import TelegramCta from "./TelegramCta";

export function HowItWorks() {
  const steps = [
    {
      title: "Збирає сигнали без зайвого вводу",
      text: "Фінанси підтягуються через Monobank. Їжу додаєш фото чи сканером. Для звички достатньо одного тапу.",
    },
    {
      title: "Зіставляє сфери",
      text: "Sergeant бачить гроші, тіло, звички й харчування разом, тому помічає те, що губиться в окремих трекерах.",
    },
    {
      title: "Повертає корисну підказку",
      text: "Отримуєш короткий висновок без оцінок і тиску. Якщо даних замало, Sergeant не вигадує звʼязок.",
    },
  ];

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-16"
    >
      <div className="max-w-2xl">
        <h2 className="font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Не чотири трекери. Одна картина
        </h2>
        <p className="mt-5 max-w-xl leading-relaxed text-muted">
          Дані стають корисними, коли видно, як одна сфера впливає на іншу.
        </p>
      </div>

      <ol className="mt-14 max-w-4xl border-b border-cardline">
        {steps.map((step) => (
          <li
            key={step.title}
            className="grid gap-3 border-t border-cardline py-8 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-12"
          >
            <h3 className="font-display text-xl font-bold text-foreground-strong sm:text-2xl">
              {step.title}
            </h3>
            <p className="max-w-lg leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ModulesSection() {
  const modules = [
    {
      name: "Фінік",
      domain: "Гроші",
      text: "Бюджети в гривні, синк із Monobank, категорії та борги без ручного вводу.",
      rule: "bg-finyk",
    },
    {
      name: "Фізрук",
      domain: "Тіло",
      text: "Плани тренувань, прогрес силових і біометрія в одному місці.",
      rule: "bg-fizruk",
    },
    {
      name: "Рутина",
      domain: "Звички",
      text: "Стріки й чек-іни з чесною статистикою без прикрашання цифр.",
      rule: "bg-routine",
    },
    {
      name: "Харчування",
      domain: "Їжа",
      text: "КБЖУ, сканер штрих-кодів і українська база продуктів.",
      rule: "bg-nutrition",
    },
  ];

  return (
    <section
      id="modules"
      aria-labelledby="modules-heading"
      className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 sm:pb-28"
    >
      <h2 id="modules-heading" className="sr-only">
        Модулі Sergeant
      </h2>
      <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((module) => (
          <article key={module.name}>
            <span
              aria-hidden="true"
              className={`block h-[3px] w-10 rounded-full ${module.rule}`}
            />
            <p className="mt-4 text-sm font-semibold text-muted">
              {module.domain}
            </p>
            <h3 className="mt-1 font-display text-xl font-bold text-foreground-strong">
              {module.name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {module.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ConnectionsSection() {
  const links = [
    {
      a: { label: "Тренування", color: "text-fizruk-glow" },
      b: { label: "Фінік", color: "text-finyk-glow" },
      insight:
        "У тижні, коли тренувань більше, замовлень доставки зазвичай менше.",
    },
    {
      a: { label: "Харчування", color: "text-nutrition-glow" },
      b: { label: "Рутина", color: "text-routine-glow" },
      insight:
        "Коли снідаєш удома, ранкова рутина тримається довше, а зриви трапляються рідше.",
    },
    {
      a: { label: "Фінік", color: "text-finyk-glow" },
      b: { label: "Харчування", color: "text-nutrition-glow" },
      insight:
        "Імпульсивні витрати на їжу частішають у дні, коли пропускаєш обід.",
    },
  ];

  return (
    <section id="connections" className="bg-ink py-20 sm:py-28">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-3xl font-display text-3xl font-bold tracking-tight text-balance text-ink-text sm:text-4xl">
          Окремі трекери показують цифри. Sergeant показує звʼязки
        </h2>

        <div className="mt-16 flex max-w-4xl flex-col gap-14">
          {links.map((link) => (
            <figure key={link.insight}>
              <div
                aria-hidden="true"
                className="flex items-center gap-4 text-sm font-semibold"
              >
                <span className={link.a.color}>{link.a.label}</span>
                <span className="relative h-px flex-1 bg-ink-line">
                  <i className="absolute -left-1 -top-1 h-[9px] w-[9px] rounded-full border-2 border-finyk-glow bg-ink" />
                  <i className="absolute -right-1 -top-1 h-[9px] w-[9px] rounded-full border-2 border-finyk-glow bg-ink" />
                </span>
                <span className={link.b.color}>{link.b.label}</span>
              </div>
              <blockquote className="mt-5 max-w-3xl font-display text-xl font-medium leading-snug text-balance text-ink-text sm:text-2xl">
                {link.insight}
              </blockquote>
              <figcaption className="sr-only">
                Звʼязок між модулями {link.a.label} і {link.b.label}
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="mt-16 max-w-xl text-sm leading-relaxed text-ink-muted">
          Приклади ілюстративні. Sergeant будує висновки на твоїх даних і
          показує лише ті, в яких достатньо впевнений.
        </p>
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
    <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <h2 className="max-w-lg font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Що вже працює, а що ще збираємо
      </h2>
      <p className="mt-4 max-w-xl leading-relaxed text-muted">
        Sergeant не обіцяє магію. Він показує звʼязки з тією впевненістю, яку
        реально має, і мовчить, коли даних замало.
      </p>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-14">
        <div>
          <h3 className="font-display text-xl font-bold text-accent">
            Вже працює
          </h3>
          <ul className="mt-5 flex flex-col gap-4 border-t border-cardline pt-5">
            {now.map((item) => (
              <li
                key={item}
                className="text-sm leading-relaxed text-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-display text-xl font-bold text-foreground-strong">
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

export function BetaCta() {
  return (
    <section
      id="beta"
      className="mx-auto w-full max-w-6xl border-t border-cardline px-5 pb-24 pt-16 sm:px-8"
    >
      <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Допоможи Sergeant побачити більше
      </h2>
      <p className="mt-4 max-w-lg leading-relaxed text-pretty text-muted">
        Ранні користувачі впливають на те, які звʼязки продукт вчиться помічати
        першими. Напишу в Telegram, щойно відкриємо доступ.
      </p>
      <div className="mt-8">
        <TelegramCta placement="footer" label="Приєднатися до бети" />
      </div>
    </section>
  );
}
