const BARS = [40, 65, 30, 80, 55, 45, 70];

export default function DashboardPreview() {
  return (
    <section
      aria-label="Превʼю дашборда Sergeant"
      className="mx-auto mt-14 grid w-full max-w-5xl grid-cols-1 gap-4 px-5 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]"
    >
      <div className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md">
        <span className="text-xs uppercase tracking-widest text-muted">
          Бюджет липня
        </span>
        <div className="mt-2 font-display text-3xl font-bold">
          ₴18 420{" "}
          <span className="text-sm font-normal text-muted">/ ₴26 000</span>
        </div>
        <div
          aria-hidden="true"
          className="mt-4 flex h-16 items-end gap-1.5"
        >
          {BARS.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-t ${
                h === 80 ? "bg-accent" : "bg-accent/35"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md">
        <span className="text-xs uppercase tracking-widest text-muted">
          Стрік звичок
        </span>
        <div className="mt-2 font-display text-3xl font-bold text-accent">
          21 день
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ранкова зарядка, читання, без цукру — тримаєшся третій тиждень.
        </p>
      </div>

      <div className="rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md">
        <span className="text-xs uppercase tracking-widest text-muted">
          Тренувань за тиждень
        </span>
        <div className="mt-2 font-display text-3xl font-bold">3 / 4</div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Наступне — завтра о 18:00. Спина + біцепс.
        </p>
      </div>

      <div
        role="log"
        aria-label="Чат з AI-сержантом"
        className="flex flex-col gap-2.5 rounded-2xl border border-cardline bg-card p-6 backdrop-blur-md md:col-span-3"
      >
        <div className="max-w-[85%] self-start rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm leading-relaxed sm:max-w-[70%]">
          Помітив: після коротких ночей ти замовляєш доставку на 40% частіше.
          Сьогодні спав 6 годин — приготуй вечерю вдома, зекономиш ~₴350.
        </div>
        <div className="max-w-[85%] self-end rounded-2xl border border-cardline bg-card px-4 py-3 text-sm text-muted sm:max-w-[70%]">
          Прийнято, сержанте.
        </div>
      </div>
    </section>
  );
}
