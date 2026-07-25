const BARS = [40, 65, 30, 80, 55, 45, 70];

export default function DashboardPreview() {
  return (
    <section
      aria-label="Приклад дашборда Sergeant"
      className="mx-auto mt-14 grid w-full max-w-5xl grid-cols-1 gap-4 px-5 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]"
    >
      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-muted">
          Бюджет липня
        </span>
        <div className="mt-2 font-display text-3xl font-bold text-foreground-strong">
          ₴18 420{" "}
          <span className="text-sm font-normal text-muted">/ ₴26 000</span>
        </div>
        <div aria-hidden="true" className="mt-4 flex h-16 items-end gap-1.5">
          {BARS.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}%` }}
              className={`flex-1 rounded-t ${
                h === 80 ? "bg-finyk" : "bg-finyk/30"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-muted">
          Стрік звичок
        </span>
        <div className="mt-2 font-display text-3xl font-bold text-routine">
          21 день
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ранкова зарядка, читання, без цукру — тримаєшся третій тиждень.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm">
        <span className="text-xs font-medium uppercase tracking-widest text-muted">
          Тренувань за тиждень
        </span>
        <div className="mt-2 font-display text-3xl font-bold text-fizruk">
          3 / 4
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Наступне — завтра о 18:00. Спина + біцепс.
        </p>
      </div>

      <div
        role="log"
        aria-label="Приклад підказки від Sergeant"
        className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm md:col-span-3"
      >
        <span className="text-xs font-medium uppercase tracking-widest text-muted">
          Тижневий підсумок
        </span>
        <div className="max-w-[90%] self-start rounded-2xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-foreground sm:max-w-[75%]">
          Схоже, у тижні з короткими ночами ти частіше замовляєш доставку — за
          останні три такі дні вийшло приблизно на ₴350 більше. Це поки лише
          спостереження, не вирок. Приготуєш вечерю вдома сьогодні?
        </div>
        <p className="pl-1 text-xs text-subtle">
          Sergeant показує звʼязок обережно — бо даних ще небагато.
        </p>
      </div>
    </section>
  );
}
