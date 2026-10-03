import { useEffect, useRef, useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { useActiveFizrukWorkout } from "@shared/hooks/useActiveFizrukWorkout";
import {
  WORKOUT_BANNER_INSET_VAR,
  useBottomInsetVar,
} from "@shared/hooks/useBottomInsetVar";
import { messages } from "@shared/i18n/uk";
import { useFizrukSqliteReadTick } from "@fizruk/lib/sqliteReadGate";
import { getCachedFizrukSqliteState } from "@fizruk/lib/sqliteReader";

/**
 * PR-Z2 (аудит 2026-09-13, хвиля 6): реальний старт тренування, не мить
 * монтування банера. `ActiveWorkoutBanner` рендериться у ДВОХ окремих
 * точках дерева — `HubHomeView` (на хабі) і `ModuleShell` (в інших
 * модулях) — тобто просте повернення на хаб під час тренування знищує
 * один інстанс компонента і монтує інший. `useState(() => Date.now())`
 * рахував відлік від цього нового монтування, тож 50-хвилинне
 * тренування показувало «1 хв» одразу після повернення на хаб. Час
 * тепер береться з `workout.startedAt` у теплому SQLite-кеші фізрука —
 * джерело незалежне від того, який саме інстанс банера зараз живий.
 *
 * Читання кешу під час рендера лишається чистим — `Date.parse` на вже
 * відомому рядку детермінований. Один нечистий момент, який лишився,
 * `Date.now()`, живе лише у двох санкціонованих місцях: лінивому
 * ініціалізаторі `useState` (виконується рівно раз, на монтування) і
 * колбеку `setInterval` (поза фазою рендера) — обидва не підпадають під
 * `react-hooks/purity`.
 */
function findWorkoutStartedAtMs(activeId: string): number | null {
  const match = getCachedFizrukSqliteState().workouts.find(
    (workout) => workout.id === activeId,
  );
  if (!match) return null;
  const ms = Date.parse(match.startedAt);
  return Number.isFinite(ms) ? ms : null;
}

function computeElapsedMinutes(nowMs: number, startMs: number): number {
  return Math.max(0, Math.floor((nowMs - startMs) / 60_000));
}

function ActiveWorkoutBannerTimer({ activeId }: { activeId: string }) {
  // Підписка на тік — щоб компонент перерендерився щойно теплий кеш
  // фізрука оновиться (наприклад, після sync-пулу). Саме значення тіку
  // не потрібне: `findWorkoutStartedAtMs` нижче читає кеш напряму на
  // кожен рендер, тож перерендер сам підтягує свіжий `startedAt`.
  useFizrukSqliteReadTick();
  // Доки кеш ще не прогрітий (або зовсім не має цього запису — теоретично
  // неможливо для валідного `activeId`, але типобезпечніше мати фолбек),
  // тимчасово рахуємо від моменту монтування; тік вище сам перерахує це
  // щойно `startedAt` стане відомим.
  const [fallbackStartMs] = useState(() => Date.now());
  const startMs = findWorkoutStartedAtMs(activeId) ?? fallbackStartMs;

  const [nowMs, setNowMs] = useState(() => Date.now());
  // Тост-трей стоїть НАД цією плашкою. Раніше він читав
  // `--active-workout-banner-offset`, якої ніхто у репо не ставив — тобто
  // змінна завжди розгорталась у `0px`, і на вузькому екрані (де тост
  // 92vw) вони накладались. Публікуємо реальну зайняту смугу.
  const bannerRef = useRef<HTMLDivElement>(null);
  useBottomInsetVar(bannerRef, WORKOUT_BANNER_INSET_VAR);

  useEffect(() => {
    const id = setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const elapsedMin = computeElapsedMinutes(nowMs, startMs);

  const label =
    elapsedMin > 0
      ? `${elapsedMin} хв · Тренування триває`
      : "Тренування триває";

  return (
    <div
      ref={bannerRef}
      className="fixed left-4 z-40 pointer-events-none"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" }}
      aria-live="polite"
    >
      <button
        type="button"
        onClick={() => openHubModule("fizruk", `#workout/${activeId}`)}
        className="pointer-events-auto flex items-center gap-2.5 h-12 pl-3 pr-4 rounded-full bg-fizruk-strong text-white shadow-float hover:brightness-110 transition-[filter,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-fizruk/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:bg-fizruk dark:text-bg"
        aria-label={messages.fizruk.returnToActiveWorkout}
      >
        <span
          className="relative flex w-8 h-8 items-center justify-center rounded-full bg-white/15"
          aria-hidden
        >
          <Icon name="dumbbell" size="md" strokeWidth={2.25} />
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success ring-2 ring-fizruk-strong motion-safe:animate-pulse" />
        </span>
        <span className="text-style-label whitespace-nowrap">{label}</span>
      </button>
    </div>
  );
}

/**
 * Persistent "return to active workout" CTA.
 *
 * Fizruk remembers the open workout in `fizruk_active_workout_id_v1`. If
 * the user navigates to the Hub (or another module) mid-set, the workout
 * is still "live" but the user has to manually open Fizruk → Workouts →
 * find the highlighted row to get back. That's three taps for an action
 * that should be one — and it's especially easy to lose the thread when
 * the user jumps to Finyk to log the protein shake they just bought.
 *
 * This banner renders in the Hub shell (outside of any module) whenever
 * an active workout id is persisted. One tap opens Fizruk and deep-links
 * to the Workouts page via the existing cross-module nav bus.
 *
 * Returns null when there's no active workout, or when `hidden` is true
 * (e.g. during the FTUX session where any extra CTA crowds the splash).
 */
export function ActiveWorkoutBanner({ hidden = false }: { hidden?: boolean }) {
  const activeId = useActiveFizrukWorkout();

  if (hidden) return null;
  if (!activeId) return null;

  return <ActiveWorkoutBannerTimer key={activeId} activeId={activeId} />;
}
