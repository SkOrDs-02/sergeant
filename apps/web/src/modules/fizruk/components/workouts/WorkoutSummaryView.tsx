/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Read-only summary for a *finished* workout, rendered by
 * `WorkoutJournalSection` on the route-owned `/fizruk/workout/<id>` page
 * once `activeWorkout.endedAt` is set (02-A). Replaces the previous
 * dead-end: the route used to keep rendering the full editable
 * `ActiveWorkoutPanel` (or, worse, an "Активне тренування не знайдено"
 * error state stacked under the finish sheets) after «Завершити».
 *
 * Deliberately NOT built on `ActiveWorkoutPanel` / `WorkoutItemsList` —
 * those own the editable in-flight UI (warm-up checklist, superset
 * controls, per-set inputs) which is the wrong shape for a glance-back
 * summary. This component only ever reads `Workout`, never mutates it.
 *
 * PR-Z1 (аудит 2026-09-13, хвиля 3 «Тупики й мертві дії»): `FizrukApp`
 * знімає шапку модуля й нижню навігацію на всьому `page === "workout"`
 * (сесійний хром — спека `fizruk-active-session.md`), і для ЖИВОЇ сесії
 * вихід несе `SessionTopBar` («Згорнути»). Ця гілка сесію не рендерить —
 * `SessionTopBar` тут нема, а єдиною дією лишалась «Повторити це
 * тренування», яка стартує НОВЕ тренування замість виходу. Власна
 * back-кнопка (той самий іконка+заголовок патерн, що й
 * `WorkoutHistory.tsx` / `Measurements.tsx`) дає вихід без старту нової
 * сесії; `sessionMode` у `FizrukApp` свідомо НЕ звужено до
 * `!endedAt` — це рухало б header/nav/FAB-логіку для всіх споживачів
 * `page === "workout"` заради однієї гілки.
 *
 * Фідбек власника 2026-11-19 («сторінка поламана»): back-кнопка й заголовок
 * стояли в картці без `safe-area-pt`, тобто ПІД статус-баром iOS — заголовок
 * накладався на годинник, а тап по стрілці в зоні статус-бара система
 * забирала собі. Тепер це сторінка, а не картка: липка шапка з відступом під
 * статус-бар (як `SessionTopBar`), вміст на фоні сторінки без «обрізаної»
 * панелі посеред екрана, редактор часу на всю ширину (раніше він сидів у
 * колонці праворуч від стрілки і поля дати виповзали за край), і жест
 * «назад» від лівого краю в standalone-PWA (`useEdgeSwipeBack`).
 */
import { formatDateTimeShort } from "@shared/lib/time/formatDate";
import { useEdgeSwipeBack } from "@shared/hooks/useEdgeSwipeBack";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import {
  formatDurShort,
  summarizeWorkoutForFinish,
} from "@sergeant/fizruk-domain";
import {
  computeWorkoutDoneItemCount,
  computeWorkoutSetCount,
  computeWorkoutTonnageKg,
  isSetCompleted,
  type Workout,
  type WorkoutItem,
} from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";
import { WorkoutStatTile } from "./WorkoutStatTile";
import { fmtLoose } from "../../lib/numberFmt";
import { formatMeasureSets } from "../../lib/measureFormat";
import { WorkoutMomentLine } from "./WorkoutMomentLine";
import { WorkoutSummaryTimeEditor } from "./WorkoutSummaryTimeEditor";

export interface WorkoutSummaryViewProps {
  workout: Workout;
  /** 02-A item 4 — starts a new session with the same exercises, no sets. */
  onRepeat: () => void;
  /** PR-Z1 — the only non-"start a new workout" way out of this screen. */
  onClose: () => void;
  /**
   * ux-11 — видалення завершеного тренування з клавіатури/миші (свайп в
   * історії — touch-only). Батько видаляє запис, показує undo-тост і веде
   * назад до списку; тут лише кнопка.
   */
  onDelete: () => void;
  /**
   * data-37 — правка початку й кінця завершеного тренування. Без пропа
   * редактор не показується.
   */
  onUpdateTimes?: (patch: { startedAt: string; endedAt: string }) => void;
}

/** One-line "what happened" caption for a single exercise entry. */
function formatItemDetail(item: WorkoutItem, rpeLabel: string): string {
  // Підходи на час, дистанцію чи лише повтори: «3 × 30 с», «3 × 400 м»
  // (спека типу виміру). Вага × повтори і старі записи — нижче.
  const measured = formatMeasureSets(item);
  if (measured !== null) return measured;
  if (item.type === "strength") {
    // Порожній рядок, який сесія створює сама, не результат: без цього
    // фільтра пропущена вправа друкувалась як «0×0», хоча плитка
    // «Підходів» його вже не рахує.
    // Той самий предикат, що й плитка «Підходів» (`computeWorkoutSetCount`).
    const sets = (item.sets || []).filter((s) => isSetCompleted(s, item));
    if (sets.length === 0) return "—";
    return sets
      .map((s) => {
        const base = `${fmtLoose(s.weightKg ?? 0)}×${s.reps ?? 0}`;
        const rpe = s["rpe"];
        // RPE is strictly optional (Borg 1..10) — omit the suffix entirely
        // rather than print a misleading "RPE 0" when it was never filled
        // in (canon `fizruk.md` §3).
        return typeof rpe === "number" ? `${base} · ${rpeLabel} ${rpe}` : base;
      })
      .join(", ");
  }
  if (item.type === "distance") {
    const distM = Number(item.distanceM) || 0;
    const durSec = Number(item.durationSec) || 0;
    return `${distM} м · ${formatDurShort(durSec)}`;
  }
  return formatDurShort(Number(item.durationSec) || 0);
}

export function WorkoutSummaryView({
  workout,
  onRepeat,
  onClose,
  onDelete,
  onUpdateTimes,
}: WorkoutSummaryViewProps) {
  const copy = messages.fizruk.workoutSummary;
  const summary = summarizeWorkoutForFinish(workout);
  const setCount = computeWorkoutSetCount(workout);
  const tonnageKg = computeWorkoutTonnageKg(workout);
  const items = workout.items || [];
  const doneItems = computeWorkoutDoneItemCount(workout);
  const wellbeing = workout.wellbeing;
  const hasWellbeing = Boolean(
    wellbeing && (wellbeing.energy != null || wellbeing.mood != null),
  );

  const edgeSwipe = useEdgeSwipeBack(onClose);

  return (
    <div className="min-h-dvh" {...edgeSwipe}>
      {/* PR-Z1 — session chrome (header + bottom nav) is off for the whole
          `workout` route, so this bar is the only way out that does not
          start a new workout (`onRepeat` below). `safe-area-pt` — the same
          reason as in `SessionTopBar`: body-level inset is gone, each
          surface applies its own. */}
      <div className="safe-area-pt sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-xl items-center px-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.backAria}
            className="focus-ring flex h-11 items-center gap-0.5 rounded-lg pl-1.5 pr-3 text-style-label font-semibold text-text hover:bg-panelHi"
          >
            <Icon name="chevron-left" size={18} aria-hidden />
            {copy.backToWorkouts}
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h1 className="text-style-title text-text">{copy.title}</h1>
        <div className="text-style-caption text-subtle mt-0.5">
          {formatDateTimeShort(new Date(workout.startedAt))}
          {/* Один « · » без відступу: `ml-2` разом із пробілом давав
              подвійний проміжок «19:40  · 10 с» (зйомка 2026-11-18). */}
          {summary ? ` · ${formatDurShort(summary.durationSec)}` : null}
        </div>
        <WorkoutMomentLine workoutId={workout.id} />
        {onUpdateTimes ? (
          <WorkoutSummaryTimeEditor
            key={`${workout.startedAt}|${workout.endedAt}`}
            workout={workout}
            onUpdateTimes={onUpdateTimes}
          />
        ) : null}

        <div className="grid grid-cols-3 gap-2 mt-4">
          <WorkoutStatTile
            label={copy.itemsLabel}
            value={
              // «Вправ 1 з 6», коли зроблено не всі; одне число, коли всі
              // (рішення founder-а 2026-11-18). Лише підпис підсумку.
              doneItems < items.length
                ? copy.itemsDoneOf
                    .replace("{done}", String(doneItems))
                    .replace("{total}", String(items.length))
                : items.length
            }
            size="lg"
          />
          <WorkoutStatTile label={copy.setsLabel} value={setCount} size="lg" />
          <WorkoutStatTile
            label={copy.volumeLabel}
            value={
              tonnageKg > 0 ? (
                <Measure value={Math.round(tonnageKg)} unit={copy.kgUnit} />
              ) : (
                "—"
              )
            }
            size="lg"
          />
        </div>

        {hasWellbeing && (
          <div className="mt-3 flex items-center gap-2 text-style-caption text-subtle">
            <span>{copy.wellbeingPrefix}</span>
            <span className="font-semibold text-text">
              {copy.energyLabel} {wellbeing?.energy ?? "—"}
              {copy.outOfFive}
              {" · "}
              {copy.moodLabel} {wellbeing?.mood ?? "—"}
              {copy.outOfFive}
            </span>
          </div>
        )}

        {items.length > 0 && (
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-panel bg-panel px-3 py-2.5">
                <div className="text-style-label text-text">{item.nameUk}</div>
                <div className="text-style-caption text-subtle mt-0.5">
                  {formatItemDetail(item, copy.rpeLabel)}
                </div>
              </li>
            ))}
          </ul>
        )}

        {workout.note && (
          <div className="mt-3">
            <div className="text-style-caption text-subtle">
              {copy.noteHeading}
            </div>
            <p className="text-style-caption text-text mt-0.5 whitespace-pre-wrap">
              {workout.note}
            </p>
          </div>
        )}

        <Button
          variant="solid"
          tone="neutral"
          className="w-full h-12 mt-4"
          type="button"
          onClick={onRepeat}
        >
          {copy.repeatCta}
        </Button>

        {/* ux-11: свайп в історії — touch-only жест (WCAG 2.1.1 / 2.5.1), тож
            завершене тренування видаляється ще й цією кнопкою. Захист від
            помилкового тапу — undo-тост, а не діалог (unified undo policy). */}
        <Button
          variant="soft"
          tone="danger"
          className="w-full h-12 mt-2"
          type="button"
          onClick={onDelete}
        >
          {copy.deleteCta}
        </Button>
      </div>
    </div>
  );
}
