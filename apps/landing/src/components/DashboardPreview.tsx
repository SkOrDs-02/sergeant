const domains = [
  {
    name: "Фінік",
    mobileName: "Фінік",
    state: "Спокійно",
    color: "text-finyk-glow",
  },
  {
    name: "Рутина",
    mobileName: "Рутина",
    state: "Стабільно",
    color: "text-routine-glow",
  },
  {
    name: "Тренування",
    mobileName: "Фізрук",
    state: "Регулярно",
    color: "text-fizruk-glow",
  },
  {
    name: "Харчування",
    mobileName: "Їжа",
    state: "Баланс",
    color: "text-nutrition-glow",
  },
];

export default function DashboardPreview() {
  return (
    <section
      aria-label="Приклад підказки Sergeant на основі кількох сфер життя"
      className="product-frame-shadow overflow-hidden rounded-[var(--radius-card)] border border-ink-line bg-ink text-ink-text"
    >
      <header className="flex items-start justify-between gap-5 border-b border-ink-line px-5 py-5 sm:px-7">
        <div>
          <h2 className="font-display text-xl font-bold text-ink-text">
            Помічник
          </h2>
          <p className="mt-1 text-sm text-finyk-glow">Сьогодні</p>
        </div>
        <span className="rounded-lg border border-ink-line px-3 py-2 text-xs text-ink-muted">
          Приклад звʼязку
        </span>
      </header>

      <div className="px-5 py-7 sm:px-7 sm:py-9">
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 800 120"
            preserveAspectRatio="none"
            className="absolute left-[8%] top-1/2 h-20 w-[84%] -translate-y-1/2 text-finyk-glow"
          >
            <path
              d="M20 60 C105 8 160 112 250 60 S395 8 510 60 S655 112 780 60"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
            {[20, 250, 510, 780].map((x) => (
              <circle
                key={x}
                cx={x}
                cy="60"
                r="7"
                fill="var(--color-ink)"
                stroke="currentColor"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          <div className="relative grid grid-cols-4 gap-2 py-4 sm:gap-4 sm:py-7">
            {domains.map((domain) => (
              <div key={domain.name} className="text-center">
                <p className="font-display text-xs font-semibold text-ink-text sm:text-base">
                  <span className="sm:hidden">{domain.mobileName}</span>
                  <span className="hidden sm:inline">{domain.name}</span>
                </p>
                <p
                  className={`mt-14 text-xs font-medium sm:mt-16 ${domain.color}`}
                >
                  {domain.state}
                </p>
              </div>
            ))}
          </div>
        </div>

        <article className="mt-7 rounded-2xl border border-ink-line bg-ink-surface px-5 py-5 sm:px-6 sm:py-6">
          <p className="text-sm leading-relaxed text-ink-text sm:text-base">
            Коли ти тренуєшся ввечері й тримаєш режим сну, наступного дня легше
            зосередитися і менше імпульсивних витрат.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-muted">
            Ілюстративний приклад. Sergeant перевіряє звʼязок на твоїх даних.
          </p>
        </article>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-line px-5 py-4 text-xs text-ink-muted sm:px-7">
        <span>Одна підказка замість чотирьох звітів</span>
        <span>Local-first зберігання</span>
      </footer>
    </section>
  );
}
