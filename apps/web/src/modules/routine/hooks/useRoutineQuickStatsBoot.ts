import { useEffect } from "react";
import { ROUTINE_EVENT, loadRoutineState } from "../lib/routineStorage";
import { writeRoutineQuickStatsSnapshot } from "./useRoutineQuickStatsWriter";

/**
 * Restores the derived Hub snapshot outside the routine module screen.
 *
 * Дзеркало `useFinykQuickStatsBoot` / `useFizrukQuickStatsBoot`. Єдиним
 * писарем знімка був `useRoutineQuickStatsWriter`, змонтований усередині
 * екрана «Рутина», тож картка на хабі показувала обіцянку «Тут зʼявиться
 * прогрес дня» навіть після створеної й виконаної звички — доки користувач
 * не відкриє модуль (browser QA 2026-08-05, F-007).
 *
 * `loadRoutineState()` вже накладає SQLite-completions поверх LS-блоба, а
 * `ROUTINE_EVENT` — той самий сигнал, яким модуль повідомляє про запис, тож
 * знімок лишається свіжим і поки екран модуля закритий.
 */
export function useRoutineQuickStatsBoot(): void {
  useEffect(() => {
    const write = () => {
      const state = loadRoutineState();
      writeRoutineQuickStatsSnapshot({
        habits: state.habits,
        completions: state.completions,
        skips: state.skips,
      });
    };

    write();
    window.addEventListener(ROUTINE_EVENT, write);
    return () => {
      window.removeEventListener(ROUTINE_EVENT, write);
    };
  }, []);
}
