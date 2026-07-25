import { Eyebrow } from "./Eyebrow";

const BARS = [40, 65, 30, 80, 55, 45, 70];

export default function DashboardPreview() {
  return (
    <section
      aria-label="Приклад дашборда Sergeant"
      className="mx-auto mt-14 grid w-full max-w-5xl grid-cols-1 gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4"
    >
      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm sm:col-span-2">
        <Eyebrow className="font-medium text-muted">
          ФІНІК · бюджет липня
        </Eyebrow>
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
        <Eyebrow className="font-medium text-muted">Рутина · стрік</Eyebrow>
        <div className="mt-2 font-display text-3xl font-bold text-routine">
          21 день
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Зарядка, читання, без цукру — третій тиждень поспіль.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm">
        <Eyebrow className="font-medium text-muted">
          ФІЗРУК · тренування
        </Eyebrow>
        <div className="mt-2 font-display text-3xl font-bold text-fizruk">
          3 / 4
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Наступне — завтра о 18:00. Спина + біцепс.
        </p>
      </div>

      <div className="rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow className="font-medium text-muted">
              Харчування · сьогодні
            </Eyebrow>
            <div className="mt-2 font-display text-3xl font-bold text-nutrition">
              1 840{" "}
              <span className="text-sm font-normal text-muted">
                / 2 100 ккал
              </span>
            </div>
          </div>
          <div className="flex gap-4 text-sm text-muted">
            <span>
              Б <b className="font-semibold text-foreground">96г</b>
            </span>
            <span>
              Ж <b className="font-semibold text-foreground">58г</b>
            </span>
            <span>
              В <b className="font-semibold text-foreground">190г</b>
            </span>
          </div>
        </div>
      </div>

      <div
        role="log"
        aria-label="Приклад підказки від Sergeant"
        className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-cardline bg-card p-6 shadow-sm sm:col-span-2 lg:col-span-4"
      >
        <Eyebrow className="font-medium text-accent">
          Звʼязок тижня · сон × харчування × гроші
        </Eyebrow>
        <div className="max-w-[90%] self-start rounded-2xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-foreground sm:max-w-[75%]">
          Схоже, у тижні з короткими ночами ти частіше замовляєш доставку — за
          останні три такі дні вийшло приблизно на ₴350 більше, а денна норма
          КБЖУ злітала. Це поки лише спостереження, не вирок. Приготуєш вечерю
          вдома сьогодні?
        </div>
        <p className="pl-1 text-xs text-subtle">
          Жоден окремий трекер цього не побачив би — звʼязок видно лише коли
          сфери поруч.
        </p>
      </div>
    </section>
  );
}
