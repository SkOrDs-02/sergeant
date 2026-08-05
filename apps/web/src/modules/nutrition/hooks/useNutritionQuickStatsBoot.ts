import { useEffect } from "react";
import { useNutritionSqliteReadTick } from "../lib/sqliteReadGate";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import { writeNutritionQuickStatsSnapshot } from "./useNutritionQuickStatsWriter";

/**
 * Restores the derived Hub snapshot after authenticated SQLite boot/pull.
 *
 * Останній з чотирьох модулів, що переїхав на цей патерн (після Фініка,
 * Фізрука й Рутини). Знімок не синкається у хмару — він перебудовується з
 * канонічного SQLite-стану, тож без цього буту єдиним писарем лишався
 * `useNutritionQuickStatsWriter`, змонтований усередині екрана «Їжа»: після
 * входу на новому пристрої картка хаба показувала обіцянку «Тут зʼявиться
 * КБЖВ», хоча прийоми їжі вже лежали в базі (browser QA 2026-08-04, F-007).
 */
export function useNutritionQuickStatsBoot(): void {
  const sqliteTick = useNutritionSqliteReadTick();

  useEffect(() => {
    const state = getCachedNutritionSqliteState();
    // Не затирати корисний знімок нулями, поки канонічний кеш ще вантажиться.
    if (!state.refreshedAt) return;
    writeNutritionQuickStatsSnapshot({ log: state.log, prefs: state.prefs });
  }, [sqliteTick]);
}
