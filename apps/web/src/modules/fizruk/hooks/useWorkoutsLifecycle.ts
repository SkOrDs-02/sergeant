import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { safeRemoveLS, safeWriteLS } from "@shared/lib/storage/storage";
import { ACTIVE_WORKOUT_KEY, type Workout } from "@sergeant/fizruk-domain";
import { restRemainingSeconds } from "../lib/restTimer";
import type { RestTimerState } from "./useFizrukRestSound";

// PR-Z8: `useWorkoutsViewFromSession` і ключ `fizruk_workouts_mode` знято.
// Це був другий, безадресний вхід у «Шаблони»: Огляд писав прапорець у
// sessionStorage і навігував на `workouts`, а вигляд перемикався вже після
// монтування. Єдиний писар був один (`Dashboard.openTemplates`) і тепер
// ходить канонічним маршрутом `templates`, тож механізм лишався б кодом,
// який ніхто не викликає, але який усе одно читається на кожному вході.

/**
 * Persist `activeWorkoutId` into local storage so a refresh keeps the
 * user inside the same session. Set-to-`null` removes the key.
 */
export function useActiveWorkoutIdPersistence(
  activeWorkoutId: string | null,
): void {
  useEffect(() => {
    if (!activeWorkoutId) safeRemoveLS(ACTIVE_WORKOUT_KEY);
    else safeWriteLS(ACTIVE_WORKOUT_KEY, activeWorkoutId);
  }, [activeWorkoutId]);
}

/**
 * Options for `useStaleActiveWorkoutCleanup`.
 */
export interface StaleActiveWorkoutCleanupOptions {
  /**
   * True when the caller is a route that owns a specific workout id
   * (`/fizruk/workout/<id>` — `Workouts.tsx` rendered with `workoutId`).
   * Disables the "home" behaviours that don't make sense once the
   * URL has already picked a workout:
   *  - auto-adopting the single unfinished workout into `activeWorkoutId`
   *    when none is selected;
   *  - clearing `activeWorkoutId` just because the selected workout has
   *    `endedAt` set.
   * Without this flag, a route-owned view of a *finished* workout used to
   * self-clear right after «Завершити» (the effect ran, saw `endedAt`,
   * and nulled the id) — the route then rendered a generic
   * "not found" dead-end instead of the read-only summary (02-A).
   *
   * Прапорець знімає і ТРЕТЮ поведінку — очищення id, якого ще немає у
   * списку. «Ще немає» і «немає взагалі» на цьому місці не розрізнити:
   * `workoutsLoaded` каже лише, що кеш SQLite бодай раз прогрівся, а не
   * що він уже містить щойно створену сесію. З базою в OPFS прогрів іде
   * через воркер і встигає ПІСЛЯ монтування маршруту — ефект бачив
   * `loaded && !selected`, занулював id, і сесія, яка через мить
   * приїжджала в кеш, уже не мала кому належати: гілка авто-підхоплення
   * під цим самим прапорцем виходить одразу. Наслідок для людини —
   * «Почати тренування» веде в «Тренування не знайдено» назавжди
   * (Playwright `fizruk-active-workout`, 2026-09-15).
   *
   * Очищення тут нічого не давало й на вигляд: сторінка малює ту саму
   * картку «не знайдено» з `activeWorkout === null`, тож видалена сесія
   * читається так само — тільки тепер оборотно.
   */
  routeOwnsWorkoutId?: boolean;
}

/**
 * Clear a stale `activeWorkoutId` that no longer matches any workout
 * (e.g. the workout was deleted on another device before sync).
 */
export function useStaleActiveWorkoutCleanup(
  workoutsLoaded: boolean,
  workouts: readonly Workout[],
  activeWorkoutId: string | null,
  setActiveWorkoutId: Dispatch<SetStateAction<string | null>>,
  options?: StaleActiveWorkoutCleanupOptions,
): void {
  const routeOwnsWorkoutId = options?.routeOwnsWorkoutId ?? false;
  useEffect(() => {
    if (!workoutsLoaded) return;
    if (!activeWorkoutId) {
      if (routeOwnsWorkoutId) return;
      const unfinished = workouts.find((workout) => !workout.endedAt);
      if (unfinished) setActiveWorkoutId(unfinished.id);
      return;
    }
    const selected = workouts.find((workout) => workout.id === activeWorkoutId);
    if (!selected) {
      // Маршрут володіє id — не забираємо його в кеша, який міг просто не
      // встигнути. Див. `routeOwnsWorkoutId` вище.
      if (!routeOwnsWorkoutId) setActiveWorkoutId(null);
      return;
    }
    if (selected.endedAt && !routeOwnsWorkoutId) {
      setActiveWorkoutId(null);
    }
  }, [
    workoutsLoaded,
    activeWorkoutId,
    workouts,
    setActiveWorkoutId,
    routeOwnsWorkoutId,
  ]);
}

/**
 * Рахує відпочинок за годинником, а не за тіками: `remaining` завжди
 * `ceil((endsAt − Date.now()) / 1000)`. Перераховується на кожен тік
 * `setInterval` і на `visibilitychange` / `pageshow` — на заблокованому
 * екрані чи в замороженому PWA інтервал не тікає, а годинник іде. Коли
 * `endsAt` досягнуто, один раз викликає `markCompletedNaturally` (звук +
 * телеметрія) і скидає таймер у `null`.
 */
export function useRestTimerCountdown(
  restTimer: RestTimerState | null,
  setRestTimer: Dispatch<SetStateAction<RestTimerState | null>>,
  markCompletedNaturally: () => void,
): void {
  const endsAt = restTimer?.endsAt ?? null;
  useEffect(() => {
    if (endsAt == null) return;
    // AI-DANGER: rest-timer countdown. Істина — `endsAt` (Date.now()), не
    // лічильник тіків: інтервал стоїть, коли екран заблоковано. Load-bearing:
    // (1) `finished` — end-cue рівно один раз, навіть коли тік і
    // visibilitychange/pageshow збіглись до ре-рендеру; (2) side-effect
    // (`markCompletedNaturally`) іде ПОЗА updater-ом setRestTimer (updater
    // має лишатись чистим — StrictMode викликає його двічі); (3) mark
    // ПЕРЕД `setRestTimer(null)`: useFizrukRestSound грає звук на переході
    // в null лише за піднятим прапорцем; (4) cleanup знімає інтервал і
    // слухачі — інакше витік між навігаціями. Звіряй з RestTimerProvider.
    let finished = false;
    const sync = () => {
      if (finished) return;
      const remaining = restRemainingSeconds(endsAt);
      if (remaining <= 0) {
        finished = true;
        markCompletedNaturally();
        setRestTimer(null);
        return;
      }
      setRestTimer((r) =>
        r && r.endsAt === endsAt && r.remaining !== remaining
          ? { ...r, remaining }
          : r,
      );
    };
    const id = setInterval(sync, 1000);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pageshow", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pageshow", sync);
    };
  }, [endsAt, markCompletedNaturally, setRestTimer]);
}

/**
 * Re-render the active-workout duration once per second while the
 * session is unfinished. Re-subscribes only when the active workout
 * `id` or its `endedAt` changes — full workout-object churn (set
 * edits, etc.) doesn't restart the interval.
 */
export function useLiveWorkoutTick(
  activeWorkout: Workout | null,
  setNow: Dispatch<SetStateAction<number>>,
): void {
  useEffect(() => {
    if (!activeWorkout?.id || activeWorkout.endedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeWorkout?.id, activeWorkout?.endedAt, setNow]);
}
