/**
 * Last validated: 2026-08-16
 * Status: Active
 */
import { useId } from "react";
import type { Workout } from "@sergeant/fizruk-domain";
import { Icon } from "@shared/components/ui/Icon";
import {
  isoToDatetimeLocalValue,
  datetimeLocalValueToIso,
} from "./activeWorkoutLib";

/**
 * Collapsible `<details>` editor for the workout's `startedAt` / `endedAt`
 * timestamps. Lives inside `ActiveWorkoutPanel`.
 *
 * **Чому summary показує самі мітки.** Скарга тестера 2026-08-16: після форми
 * «Записати тренування заднім числом», де вже введені дата, початок і кінець,
 * згорнутий блок читався як ПОРОЖНЄ поле, що просить той самий час удруге —
 * сіра смуга з приглушеним підписом «Час тренування» і нічим більше виглядає
 * рівно як незаповнений `input` з placeholder-ом. Тому summary тепер несе
 * значення («13 серп., 17:30 → 18:20») і шеврон: це підсумок уже введеного,
 * який можна розгорнути, а не запит на ввід.
 *
 * **Чому кінець видно ще до «Завершити».** Ретро-сесія народжується
 * НЕзавершеною, а введений кінець чекає в `pendingRetroEnd` (див. докблок
 * там) — тож умова `endedAt ?` ховала мітку, яку людина щойно ввела власноруч,
 * і це була друга половина тієї ж скарги. Коли кінець прийшов з ретро-форми,
 * поле показуємо й даємо правити через `onPendingEndChange`; запис у
 * `endedAt` як був, так і лишається кроком «Завершити».
 */
export interface WorkoutTimeEditorProps {
  activeWorkout: Workout;
  updateWorkout: (id: string, patch: Partial<Workout>) => void;
  /**
   * Кінець ретро-сесії, яку ще заповнюють: він уже введений людиною, але
   * навмисно ще не записаний у `endedAt`. `null` — для звичайного live-старту.
   */
  pendingEndedAt?: string | null | undefined;
  /** Правка відкладеного кінця. Обовʼязкова, коли `pendingEndedAt` заданий. */
  onPendingEndChange?: ((iso: string) => void) | undefined;
}

const INPUT_CLASS =
  "input-focus-fizruk block w-full min-w-0 max-w-full h-11 rounded-xl border border-line bg-panelHi px-3 text-sm text-text [min-inline-size:0] [inline-size:100%]";

/** `17:30`. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Кінець тієї ж доби показуємо самим часом. А от сесія через північ мусить
 * показати дату: «23:40 → 00:20» без неї виглядає як відʼємна тривалість.
 */
function formatEndStamp(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return "";
  /* eslint-disable sergeant-design/prefer-kyiv-time -- ADR-0078: доба
     тренування належить ПРИСТРОЮ. Обидві мітки вводяться настінним годинником
     користувача (`datetime-local` тут і `buildPastWorkoutTimes` у ретро-формі),
     і рядок нижче лише вирішує, чи повторювати дату в підписі. Київський
     календар дав би розбіжність із полями, які людина бачить поруч. */
  const sameDay =
    !Number.isNaN(start.getTime()) &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  /* eslint-enable sergeant-design/prefer-kyiv-time */
  return sameDay
    ? formatTime(endIso)
    : end.toLocaleString("uk-UA", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function WorkoutTimeEditor({
  activeWorkout,
  updateWorkout,
  pendingEndedAt,
  onPendingEndChange,
}: WorkoutTimeEditorProps) {
  const fieldsId = useId();
  const startId = `${fieldsId}-started`;
  const endId = `${fieldsId}-ended`;

  // `endedAt` — записаний факт, `pendingEndedAt` — уже введений намір. Перший
  // виграє: щойно тренування завершене, відкладена мітка втрачає сенс.
  const endedAt = activeWorkout.endedAt ?? null;
  const pendingEnd = endedAt ? null : (pendingEndedAt ?? null);
  const shownEnd = endedAt ?? pendingEnd;

  // Дату й тривалість НЕ повторюємо: вони вже стоять у шапці панелі рядком
  // вище, і саме зайве повторення тестер назвав дублюванням. Summary додає те,
  // чого в шапці немає, — вікно «початок → кінець».
  const startTime = formatTime(activeWorkout.startedAt);
  const summaryValue = shownEnd
    ? `${startTime} → ${formatEndStamp(activeWorkout.startedAt, shownEnd)}`
    : startTime
      ? `з ${startTime}`
      : "";

  return (
    <details className="group mt-3 rounded-xl border border-line bg-panelHi/50 px-3 py-2">
      <summary className="flex items-center justify-between gap-2 min-h-[44px] -mx-1 px-1 rounded-lg cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg">
        <span className="min-w-0">
          <span className="block text-style-caption text-subtle">
            Час тренування
          </span>
          {summaryValue ? (
            <span className="block text-style-body text-text truncate">
              {summaryValue}
            </span>
          ) : null}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className="shrink-0 text-subtle transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-2 space-y-2">
        <label
          className="block text-style-caption text-subtle"
          htmlFor={startId}
        >
          Початок
        </label>
        <input
          id={startId}
          type="datetime-local"
          className={INPUT_CLASS}
          value={isoToDatetimeLocalValue(activeWorkout.startedAt)}
          onChange={(e) => {
            const iso = datetimeLocalValueToIso(e.target.value);
            if (iso) updateWorkout(activeWorkout.id, { startedAt: iso });
          }}
        />
        {endedAt ? (
          <>
            <label
              className="block text-style-caption text-subtle"
              htmlFor={endId}
            >
              Завершення (можна виправити після занесення)
            </label>
            <input
              id={endId}
              type="datetime-local"
              className={INPUT_CLASS}
              value={isoToDatetimeLocalValue(endedAt)}
              onChange={(e) => {
                const iso = datetimeLocalValueToIso(e.target.value);
                updateWorkout(activeWorkout.id, { endedAt: iso || null });
              }}
            />
          </>
        ) : pendingEnd ? (
          <>
            <label
              className="block text-style-caption text-subtle"
              htmlFor={endId}
            >
              Завершення (запишеться, коли натиснеш «Завершити»)
            </label>
            <input
              id={endId}
              type="datetime-local"
              className={INPUT_CLASS}
              value={isoToDatetimeLocalValue(pendingEnd)}
              onChange={(e) => {
                // Порожнє/нерозбірне значення ігноруємо: скинути відкладену
                // мітку в «нічого» нема куди — `endWorkout` тоді просто візьме
                // поточний час, і людина мовчки отримає не те, що бачила.
                const iso = datetimeLocalValueToIso(e.target.value);
                if (iso) onPendingEndChange?.(iso);
              }}
            />
          </>
        ) : null}
      </div>
    </details>
  );
}
