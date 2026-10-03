import { useEffect } from "react";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { writeFizrukQuickStatsSnapshot } from "./useFizrukQuickStatsWriter";

/**
 * Restores the derived Hub snapshot after authenticated SQLite boot/pull.
 *
 * Дзеркало `useFinykQuickStatsBoot`. Знімок навмисно не синкається у хмару —
 * він перебудовується з канонічного SQLite-стану. Без цього буту єдиним
 * писарем був `useFizrukQuickStatsWriter`, змонтований усередині екрана
 * модуля: після входу на новому пристрої картка «Фізрук» на хабі показувала
 * обіцянку «Тут зʼявиться серія» — доки користувач сам не відкриє Фізрука,
 * хоча тренування вже лежали в базі (browser QA 2026-08-05, F-007).
 */
export function useFizrukQuickStatsBoot(): void {
  const sqliteTick = useFizrukSqliteReadTick();

  useEffect(() => {
    const state = getCachedFizrukSqliteState();
    // Не затирати корисний знімок нулями, поки канонічний кеш ще вантажиться.
    if (!state.refreshedAt) return;
    writeFizrukQuickStatsSnapshot(state.workouts);
  }, [sqliteTick]);
}
