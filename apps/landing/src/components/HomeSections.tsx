import WaitlistForm from "./WaitlistForm";

export function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Логи зʼявляються самі",
      text: "Monobank webhook — фінанси. Сканер штрих-кодів — їжа. Звички — один тап. Тренування — таймер.",
    },
    {
      n: "02",
      title: "AI бачить усе разом",
      text: "HubChat читає 4 модулі одночасно і знаходить звʼязки — як сон впливає на витрати, а їжа на тренування.",
    },
    {
      n: "03",
      title: "Дія за одну фразу",
      text: "«Додай тренування 45 хв» — Sergeant сам створить запис, оновить прогрес і нагадає завтра.",
    },
  ];

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20"
    >
      <h2 className="text-center font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
        AI-чат, що <span className="text-accent">розуміє контекст</span>
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-center leading-relaxed text-muted">
        Sergeant читає твої транзакції, тренування і логи — і відповідає так,
        ніби бачив твій день своїми очима.
      </p>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <article
            key={s.n}
            className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md"
          >
            <span className="font-display text-sm font-bold text-accent">
              {s.n}
            </span>
            <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
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
      title: "Фінанси",
      text: "UAH-first бюджети, monobank-синк, категорії та борги.",
    },
    {
      icon: "▲",
      title: "Фітнес",
      text: "Плани тренувань, прогрес силових, біометрія.",
    },
    {
      icon: "✓",
      title: "Звички",
      text: "Стріки, чек-іни, чесна статистика без самообману.",
    },
    {
      icon: "◐",
      title: "Харчування",
      text: "КБЖУ, сканер штрих-кодів, українська база продуктів.",
    },
  ];

  return (
    <section
      id="modules"
      className="mx-auto w-full max-w-5xl px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="mb-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            4 модулі + HubChat
          </p>
          <h2 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Все в одному hub-і
          </h2>
        </div>
        <span className="text-sm text-muted">
          Заміняє MyFitnessPal, YNAB, habit-tracker і блокнот
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {modules.map((m) => (
          <article
            key={m.title}
            className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md"
          >
            <div
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent/15 text-sm font-extrabold text-accent"
            >
              {m.icon}
            </div>
            <h3 className="mt-4 font-display text-lg font-bold">{m.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {m.text}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BetaCta() {
  return (
    <section id="beta" className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8">
      <div className="rounded-3xl border border-accent/30 bg-accent/10 p-8 backdrop-blur-md sm:p-12">
        <span className="inline-block rounded-full border border-cardline bg-card px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">
          Закрита бета · 500 місць
        </span>
        <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl">
          Ранній доступ + Pro назавжди безкоштовно
        </h2>
        <p className="mt-4 max-w-xl leading-relaxed text-muted">
          Перші 500 бета-юзерів зберігають Pro-тариф довічно — навіть після
          публічного запуску. Чесно, без темних патернів.
        </p>
        <div className="mt-8">
          <WaitlistForm tierInterest="pro" buttonLabel="Забронювати місце" />
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
          <li>7 днів Pro без картки</li>
          <li>3 інвайти для друзів</li>
          <li>Закритий Telegram-канал</li>
        </ul>
      </div>
    </section>
  );
}
