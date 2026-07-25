import WaitlistForm from "./WaitlistForm";
import { Eyebrow } from "./Eyebrow";

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Логи зʼявляються майже самі",
      text: "Фінанси підтягуються через Monobank. Їжу додаєш фото чи сканером. Звичка — один тап, тренування — таймер.",
    },
    {
      n: "02",
      title: "Sergeant зводить це докупи",
      text: "Один застосунок бачить усі чотири сфери одночасно — тому може помітити те, що окремі трекери проґавлять.",
    },
    {
      n: "03",
      title: "Ти отримуєш підказку, а не докір",
      text: "Раз на тиждень — короткий підсумок звʼязків. Спокійно, як від друга, а не як від сержанта на плацу.",
    },
  ];

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24"
    >
      <Eyebrow className="block text-center font-semibold text-accent">
        Як це працює
      </Eyebrow>
      <h2 className="mx-auto mt-3 max-w-2xl text-center font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
        Цінність не в тому, що все в одному місці. А в{" "}
        <span className="text-accent">звʼязках</span> між сферами.
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-muted">
        Окрема апка для грошей не знає про твій сон. Трекер їжі — про твої
        витрати. Sergeant тримає все поруч, тому бачить картину цілком.
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <article
            key={s.n}
            className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm"
          >
            <span className="font-display text-sm font-bold text-accent">
              {s.n}
            </span>
            <h3 className="mt-3 font-display text-lg font-bold text-foreground-strong">
              {s.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ModulesSection() {
  const modules = [
    {
      icon: "₴",
      title: "ФІНІК — гроші",
      text: "Бюджети в гривні, синк із Monobank, категорії та борги без ручного вводу.",
      className: "text-finyk",
      soft: "bg-finyk-soft",
    },
    {
      icon: "▲",
      title: "ФІЗРУК — тіло",
      text: "Плани тренувань, прогрес силових і біометрія в одному місці.",
      className: "text-fizruk",
      soft: "bg-fizruk-soft",
    },
    {
      icon: "✓",
      title: "Рутина — звички",
      text: "Стріки й чек-іни з чесною статистикою — без прикрашання цифр.",
      className: "text-routine",
      soft: "bg-routine-soft",
    },
    {
      icon: "◐",
      title: "Харчування",
      text: "КБЖУ, сканер штрих-кодів і українська база продуктів.",
      className: "text-nutrition",
      soft: "bg-nutrition-soft",
    },
  ];

  return (
    <section
      id="modules"
      className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mb-10 max-w-2xl">
        <Eyebrow className="font-semibold text-accent">Чотири сфери</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Кожна сфера — окремий модуль. Разом — одна картина.
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <article
            key={m.title}
            className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm"
          >
            <div
              aria-hidden="true"
              className={`grid h-10 w-10 place-items-center rounded-xl text-base font-extrabold ${m.soft} ${m.className}`}
            >
              {m.icon}
            </div>
            <h3 className="mt-4 font-display text-base font-bold text-foreground-strong">
              {m.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {m.text}
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
      a: { label: "ФІЗРУК", className: "bg-fizruk-soft text-fizruk" },
      b: { label: "ФІНІК", className: "bg-finyk-soft text-finyk" },
      insight:
        "У тижні, коли ти тренуєшся 3+ рази, замовлень доставки помітно менше.",
    },
    {
      a: { label: "Харчування", className: "bg-nutrition-soft text-nutrition" },
      b: { label: "Рутина", className: "bg-routine-soft text-routine" },
      insight:
        "Коли снідаєш вдома, ранкова рутина тримається довше, а зриви — рідше.",
    },
    {
      a: { label: "ФІНІК", className: "bg-finyk-soft text-finyk" },
      b: { label: "Харчування", className: "bg-nutrition-soft text-nutrition" },
      insight:
        "Імпульсивні витрати на їжу частішають у дні, коли пропускаєш обід.",
    },
  ];

  return (
    <section
      id="connections"
      className="hero-wash mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow className="font-semibold text-accent">Головна фішка</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Окремі трекери показують цифри. Sergeant показує{" "}
          <span className="text-accent">звʼязки</span> між ними.
        </h2>
        <p className="mt-4 leading-relaxed text-muted">
          Ось приклади того, що стає видно, коли всі сфери поруч. Sergeant
          показує такі звʼязки лише коли впевнений — і чесно каже, коли даних ще
          замало.
        </p>
      </div>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {links.map((l) => (
          <article
            key={l.insight}
            className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${l.a.className}`}
              >
                {l.a.label}
              </span>
              <span aria-hidden="true" className="text-lg text-subtle">
                ×
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${l.b.className}`}
              >
                {l.b.label}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-foreground">
              {l.insight}
            </p>
          </article>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-subtle">
        Приклади ілюстративні. Реальні звʼязки Sergeant будує на твоїх даних — і
        з часом бачить їх дедалі точніше.
      </p>
    </section>
  );
}

export function HonestSection() {
  const now = [
    "Автосинк фінансів через Monobank",
    "Логи їжі, тренувань і звичок",
    "Тижневий підсумок з кількома звʼязками між сферами",
  ];
  const soon = [
    "Глибша аналітика кореляцій (поки бачимо кілька пар за раз)",
    "Динамічні цілі, що підлаштовуються під тебе",
    "Більше джерел даних поза Monobank",
  ];

  return (
    <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="max-w-2xl">
        <Eyebrow className="font-semibold text-accent">Чесно про стан</Eyebrow>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Що вже працює, а що ще збираємо
        </h2>
        <p className="mt-4 leading-relaxed text-muted">
          Ми не обіцяємо магію. Sergeant показує звʼязки з тією впевненістю, яку
          реально має, і мовчить, коли даних ще замало.
        </p>
      </div>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm">
          <h3 className="font-display text-lg font-bold text-foreground-strong">
            Вже в застосунку
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {now.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-0.5 text-accent">
                  ✓
                </span>
                <span className="text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[var(--radius-card)] border border-cardline bg-surface p-6 shadow-sm">
          <h3 className="font-display text-lg font-bold text-foreground-strong">
            У розробці
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {soon.map((item) => (
              <li key={item} className="flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-0.5 text-subtle">
                  ◦
                </span>
                <span className="text-muted">{item}</span>
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
    <section id="beta" className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8">
      <div className="rounded-[var(--radius-card)] border border-cardline bg-accent-soft p-8 shadow-sm sm:p-12">
        <Eyebrow className="inline-block rounded-full bg-accent px-3 py-1 font-bold text-accent-ink">
          Рання бета
        </Eyebrow>
        <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-balance text-foreground-strong sm:text-4xl">
          Долучайся, поки ми будуємо це разом
        </h2>
        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          Ранні користувачі формують продукт: обираєш, які звʼязки Sergeant
          вчиться помічати першими. Напишемо ��а пошту, щойно відкриємо доступ.
        </p>
        <div className="mt-8">
          <WaitlistForm tierInterest="pro" buttonLabel="Приєднатись до бети" />
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <li>Ранній доступ до нових модулів</li>
          <li>Прямий звʼязок із командою</li>
          <li>Без спаму — тільки по суті</li>
        </ul>
      </div>
    </section>
  );
}
