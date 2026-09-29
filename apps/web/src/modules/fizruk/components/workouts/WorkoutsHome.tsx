/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useMemo } from "react";
import { pluralExercises } from "@sergeant/shared";
import { setsCountLabel } from "../session/sessionLib";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Card } from "@shared/components/ui/Card";
import { messages } from "@shared/i18n/uk";
import { formatDateShort } from "@shared/lib/time/formatDate";
import {
  computeWorkoutSummary,
  isLightWorkout,
} from "@sergeant/fizruk-domain/domain";

type WorkoutItem = ReadonlyArray<unknown>;

type WorkoutShape = {
  id: string;
  startedAt: string;
  endedAt?: string | null;
  items?: WorkoutItem;
  /** Оцінка витрат; показується довідково, на норму КБЖВ сама не впливає. */
  kcalBurned?: number | undefined;
};

export interface WorkoutsHomeProps {
  activeWorkout: WorkoutShape | null;
  activeDuration: string | null;
  recentWorkouts: ReadonlyArray<WorkoutShape>;
  onOpenSession: () => void;
  onOpenCatalog: () => void;
  onOpenJournal: () => void;
  /**
   * Відкриває КОНКРЕТНЕ тренування зі списку «Останні». Доти кожен рядок
   * викликав `onOpenJournal`, тобто всі вони вели в той самий загальний
   * журнал, хоча рядок несе повний підсумок запису і шеврон — тобто
   * обіцяє перехід саме в нього (аудит 2026-09-16, WF-7). Маршрут
   * `workout/:id` уже вживаний у `WorkoutHistory` і для активної сесії.
   * Опційний: якщо хост його не передав, рядок лишається на старій
   * поведінці, а не стає мертвим.
   */
  onOpenWorkout?: ((id: string) => void) | undefined;
  /**
   * «Почати тренування» — відкриває аркуш вибору способу (`QuickStartSheet`:
   * за шаблоном, підібрати вправи, за програмою). До 2026-09-16 кнопка
   * називалась «Швидкий старт» і одразу створювала порожню сесію, а шаблони
   * мали окреме посилання «або із шаблону →» під нею; власник попросив
   * зібрати входи за двома осями — «почати зараз» і «записати те, що вже
   * було» — по одній кнопці на кожну, з вибором усередині.
   */
  onRequestStart: () => void;
  /**
   * Відкриває форму «Внести проведене заняття» — тренування заднім числом.
   *
   * Третій шлях свідомо: #589 звів старт до двох, але в описі того PR
   * рішення пояснене прибиранням «Програм», а ретро змело мовчки. Від
   * решти шляхів відрізняється лише мітками часу: сесія так само жива,
   * так само займає слот «одне активне» і так само йде через «Завершити».
   */
  onLogPast: () => void;
  /**
   * Deep-link into the Routine module's calendar so the user can
   * schedule a future training session. Surfaced as a row in
   * «Довідники» when the host (`Workouts.tsx`) wires it through. The button is
   * hidden when `onOpenSchedule` is not provided so we don't show a
   * dead control on hosts where deep-linking isn't available.
   */
  onOpenSchedule?: (() => void) | undefined;
  /**
   * 04-A — navigates to `/fizruk/programs`. Programs used to be
   * reachable only from the empty-plan hero card on Огляд, which
   * disappears the moment a workout starts — leaving the route with no
   * in-app entry point at all. `WorkoutsHome` now surfaces a permanent
   * row in "Довідники" instead (not a fifth bottom-nav tab — the
   * founder explicitly rejected that: four tabs fit 390px, Programs is
   * a once-a-month visit).
   */
  onOpenPrograms: () => void;
  onOpenStrongImport: () => void;
  /** Active program's display name, if any — folded into the row subtitle. */
  activeProgramName?: string | null | undefined;
}

export function WorkoutsHome({
  activeWorkout,
  activeDuration,
  recentWorkouts,
  onOpenSession,
  onOpenCatalog,
  onOpenJournal,
  onOpenWorkout,
  onOpenPrograms,
  onOpenStrongImport,
  activeProgramName,
  onRequestStart,
  onLogPast,
  onOpenSchedule,
}: WorkoutsHomeProps) {
  const hasActive = !!activeWorkout && !activeWorkout.endedAt;

  return (
    <div className="space-y-4">
      {hasActive ? (
        <div className="rounded-2xl border border-fizruk-ring/40 bg-fizruk/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-style-caption text-fizruk-strong">
                Активне тренування
              </div>
              <div className="mt-1 text-sm text-text">
                <span className="font-bold">{activeDuration ?? "00:00"}</span>
                {" · "}
                {(activeWorkout?.items || []).length}{" "}
                {pluralExercises((activeWorkout?.items || []).length)}
              </div>
            </div>
            <Button
              variant="solid"
              tone="fizruk"

              className="h-11 px-4"
              onClick={onOpenSession}
            >
              Відкрити
            </Button>
          </div>
          {/* Ретро лишається доступним і під час живої сесії, хоч тепер воно
              теж займає слот: ховати кнопку означало б мовчки вирішити за
              людину. Показуємо — і на кліку дає той самий діалог конфлікту,
              де вибір її: завершити поточне чи викинути. */}
          <Button
            variant="outline"
            className="mt-3 w-full h-11"
            onClick={onLogPast}
          >
            <Icon name="edit" size="md" aria-hidden />{" "}
            {messages.fizruk.logPast.cta}
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4 text-center">
          <div className="text-style-label text-text">
            Немає активного тренування
          </div>
          <div className="text-style-caption text-subtle mt-1">
            Почни зараз або запиши те, що вже провів.
          </div>
          {/* Дві кнопки за двома осями — «зараз» і «вже було», — а вибір
              способу живе всередині кожної (аркуш старту: шаблон / підбір /
              програма; форма запису: заняття й час / по підходах / швидкий).
              Історія: три рівні кнопки читались як три різні речі (звіт
              2026-09-03) → ієрархія з двома текстовими посиланнями → чотири
              елементи в ряду (2026-09-15) → власник 2026-09-16: «забагато
              кнопок і маршрутів», зібрати. */}
          <div
            role="group"
            className="mt-3 flex flex-col gap-2"
            aria-label="Способи почати або внести тренування"
          >
            <Button
              variant="solid"
              tone="fizruk"
              className="h-12 text-base"
              onClick={onRequestStart}
            >
              <Icon name="play" size="md" aria-hidden /> Почати тренування
            </Button>
            <Button
              variant="outline"
              className="h-12 text-base"
              onClick={onLogPast}
            >
              <Icon name="edit" size="md" aria-hidden />{" "}
              {messages.fizruk.logPast.cta}
            </Button>
          </div>
        </div>
      )}

      <Card as="section" radius="lg" aria-label="Останні тренування">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-style-label text-text">Останні тренування</h2>
          {recentWorkouts.length > 0 ? (
            <button
              type="button"
              className="text-style-caption text-fizruk-strong hover:underline active:opacity-70 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              onClick={onOpenJournal}
            >
              Всі
            </button>
          ) : null}
        </div>
        {recentWorkouts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {recentWorkouts.map((w) => (
              <li key={w.id}>
                <button
                  type="button"
                  className="w-full text-left rounded-xl border border-line bg-bg px-3 py-3 flex items-center justify-between hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  onClick={() =>
                    onOpenWorkout ? onOpenWorkout(w.id) : onOpenJournal()
                  }
                >
                  <RecentWorkoutSummary workout={w} />
                  <Icon
                    name="chevron-right"
                    size="sm"
                    className="text-subtle"
                    aria-hidden
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-line p-4 text-style-body text-subtle text-center">
            Після першого завершеного тренування тут зʼявляться останні сесії.
          </div>
        )}
      </Card>

      <Card as="section" radius="lg" aria-label="Довідники">
        <h2 className="text-style-label text-text mb-3">Довідники</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={onOpenCatalog}
          >
            <div className="flex items-center gap-3">
              <Icon name="book-open" size={22} className="text-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">Каталог вправ</div>
                <div className="text-style-caption text-subtle mt-0.5">
                  Пошук · групи мʼязів · своя вправа
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="text-subtle"
                aria-hidden
              />
            </div>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={onOpenPrograms}
          >
            <div className="flex items-center gap-3">
              <Icon name="list-checks" size={22} className="text-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">
                  {messages.fizruk.programsRow.title}
                </div>
                <div className="text-style-caption text-subtle mt-0.5 truncate">
                  {activeProgramName
                    ? `${messages.fizruk.programsRow.activePrefix} ${activeProgramName}`
                    : messages.fizruk.programsRow.subtitle}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="text-subtle"
                aria-hidden
              />
            </div>
          </button>
          {onOpenSchedule && (
            <button
              type="button"
              className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              onClick={onOpenSchedule}
            >
              <div className="flex items-center gap-3">
                <Icon name="calendar" size={22} className="text-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-style-label text-text">Планування</div>
                  <div className="text-style-caption text-subtle mt-0.5">
                    Відкрити календар тренувань у Routine
                  </div>
                </div>
                <Icon
                  name="chevron-right"
                  size="sm"
                  className="text-subtle"
                  aria-hidden
                />
              </div>
            </button>
          )}
          <button
            type="button"
            className="rounded-2xl border border-line bg-bg p-4 text-left hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={onOpenStrongImport}
          >
            <div className="flex items-center gap-3">
              <Icon name="upload" size={22} className="text-muted" />
              <div className="flex-1 min-w-0">
                <div className="text-style-label text-text">
                  {messages.fizruk.strongImport.rowTitle}
                </div>
                <div className="text-style-caption text-subtle mt-0.5">
                  {messages.fizruk.strongImport.rowSubtitle}
                </div>
              </div>
              <Icon
                name="chevron-right"
                size="sm"
                className="text-subtle"
                aria-hidden
              />
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
}

interface RecentWorkoutSummaryProps {
  workout: WorkoutShape;
}

export function RecentWorkoutSummary({ workout }: RecentWorkoutSummaryProps) {
  const summary = useMemo(
    () => computeWorkoutSummary(workout as never),
    [workout],
  );
  const started = new Date(workout.startedAt);
  const dateLabel = formatDateShort(started);
  const parts: string[] = [];
  if (summary.itemCount > 0)
    parts.push(`${summary.itemCount} ${pluralExercises(summary.itemCount)}`);
  if (summary.setCount > 0) parts.push(setsCountLabel(summary.setCount));
  const durMin = summary.durationSec
    ? Math.max(1, Math.round(summary.durationSec / 60))
    : null;
  if (durMin !== null) parts.push(`${durMin}\u202Fхв`);
  if (typeof workout.kcalBurned === "number" && workout.kcalBurned > 0) {
    parts.push(`${workout.kcalBurned} ккал`);
  }
  const subtitle = parts.length ? parts.join(" · ") : "порожнє тренування";

  return (
    <div className="flex-1 pr-2">
      <div className="flex items-center gap-2">
        <span className="text-style-label text-text">{dateLabel}</span>
        {!summary.isFinished ? (
          <span className="text-style-caption font-semibold text-warning-strong bg-warning/15 px-2 py-0.5 rounded-full">
            Чернетка
          </span>
        ) : isLightWorkout(workout as never) ? (
          // Той самий бейдж, що в історії: легкий запис на дні є, серію не
          // рухає (канон §8, 2026-09-15).
          <span className="text-style-caption font-semibold text-fizruk-strong dark:text-fizruk bg-fizruk/10 px-2 py-0.5 rounded-full">
            {messages.fizruk.workoutHistory.lightBadge}
          </span>
        ) : null}
      </div>
      <div className="text-style-caption text-subtle mt-0.5 truncate">
        {subtitle}
      </div>
    </div>
  );
}
