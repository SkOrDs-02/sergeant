/**
 * React hook that boots the SQLite read path for Фізрук.
 *
 * PR #029 of `docs/planning/storage-roadmap.md`. When the
 * `feature.fizruk.sqlite_v2.read_sqlite` flag is on, this hook runs
 * `bootFizrukSqliteReadPath()` once after mount so subsequent reads
 * in `useWorkouts` / `useExerciseCatalog` / `useMeasurements` overlay
 * from the local `fizruk_*` SQLite tables instead of LS.
 *
 * Fire-and-forget — boot failures fall back to LS silently (console
 * warning only). The caller does NOT need to gate rendering on the
 * boot promise.
 */

import { useEffect, useRef } from "react";
import { logger } from "@shared/lib";
import { useLocalUserId } from "../../../core/auth/useLocalUserId";
import { bootFizrukSqliteReadPath } from "../lib/sqliteReadBoot";
import { notifyFizrukSqliteCacheRefresh } from "../lib/sqliteReadGate";

/**
 * Чи бут читання ЗАРАЗ У ПОЛЬОТІ.
 *
 * AI-DANGER: прапорець навмисно «в польоті», а не «відпрацював», і
 * підміняти одне одним не можна — від цього залежить, у який бік
 * ламається продукт.
 *
 * «Відпрацював» стартує з `false` і вимагає, щоб щось його підняло. Якщо
 * бут не запустився взагалі — кластер не змонтований, лінивий чанк
 * `FizrukBootCluster` не завантажився, `userId` ще `null` — прапорець
 * лишається `false` назавжди, і споживач, який на ньому чекає, чекає
 * вічно. «У польоті» ж стартує з `false` і означає «ніхто нічого не
 * везе»: споживач малює те, що має, і найгірший випадок — спалах, а не
 * глухий кут.
 *
 * Навіщо це взагалі: `bootFizrukSqliteReadPath` ловить власні помилки і
 * повертає `false`, нічого не позначивши свіжим, тож `refreshedAt`
 * лишається `null` НАЗАВЖДИ — а разом із ним `workoutsLoaded` з
 * `useWorkouts`. Гейт скелетона, збудований на самому `!workoutsLoaded`,
 * у такому разі виходу не має. Впасти може будь-що в тому ланцюжку:
 * `getSqliteDb()` перекидає помилку далі (`core/db/sqlite.ts:260-266`), а
 * поруч у тому ж `try` стоїть `migrateFizruk`.
 */
let bootInFlight = false;

/** @see bootInFlight */
export function isFizrukReadBootInFlight(): boolean {
  return bootInFlight;
}

/** Тест-хелпер: виставити прапорець польоту (і скинути між специфікаціями). */
export function __setFizrukReadBootInFlightForTests(value: boolean): void {
  bootInFlight = value;
}

export function useFizrukSqliteReadBoot(): void {
  // AI-CONTEXT: demo and anonymous sessions both bypass auth (no user
  // id), but the SQLite read-boot + residual `fizruk_*` LS->SQLite
  // drain are userId-gated. `useLocalUserId` hands out a synthetic id
  // for both, so the seeded demo payload reaches the read cache
  // (QA D-002) and an anonymous visitor reads back what
  // `useFizrukDualWriteBoot` wrote under the same id.
  const userId = useLocalUserId();
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current || !userId) return;
    didBoot.current = true;

    bootInFlight = true;
    const settle = () => {
      bootInFlight = false;
      // Повідомляємо ЗАВЖДИ, не лише при успіху: скелетон дашборда
      // тримається саме на цьому прапорці, і без сигналу про невдачу
      // людина лишилась би дивитись на нього до перезавантаження.
      notifyFizrukSqliteCacheRefresh();
    };

    void bootFizrukSqliteReadPath(userId)
      .then((activated) => {
        if (activated) {
          // Notify consumers (useWorkouts/useMeasurements/useExerciseCatalog)
          // that the cache is fresh so they re-render with the SQLite
          // overlay.
          notifyFizrukSqliteCacheRefresh();
        }
      })
      // `.finally` НЕ гасить відхилення — воно йде далі по ланцюжку, і без
      // цього `catch` ми б отримували `unhandledrejection` рівно на тому
      // шляху, задля якого й заведено `settle`: `getSqliteDb()` перекидає
      // помилку далі, тож `bootFizrukSqliteReadPath` ловить не все.
      .catch((error: unknown) => {
        logger.warn(
          "[fizruk.sqliteRead] boot rejected outside its own catch",
          error instanceof Error ? error.message : error,
        );
      })
      .finally(settle);
  }, [userId]);
}
