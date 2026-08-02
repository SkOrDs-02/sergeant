/**
 * Свіжість локальної репліки для recovery-поверхонь (аудит E-2).
 *
 * AI-CONTEXT: hook навмисно тонкий — уся логіка живе в
 * `core/syncEngine/replicaFreshness.ts`, щоб її можна було тестувати без
 * React. Тут лише «коли перечитувати»: після кожного оновлення локального
 * кешу (той самий tick, що вже рухає `useWorkouts`/`useRecovery`) і один раз
 * на монтуванні.
 *
 * Стан «ще не знаємо» — це `complete: false`, а не «все гаразд». Порада
 * безпеки не має права вважати свою картину повною за замовчуванням.
 */
import { useEffect, useState } from "react";
import { getSqliteDb } from "../../../core/db/sqlite";
import {
  readReplicaFreshness,
  unknownReplicaFreshness,
  type ReplicaFreshness,
} from "../../../core/syncEngine/replicaFreshness";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

export function useReplicaFreshness(): ReplicaFreshness {
  const tick = useFizrukSqliteReadTick();
  const [state, setState] = useState<ReplicaFreshness>(unknownReplicaFreshness);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const handle = await getSqliteDb();
        const next = await readReplicaFreshness(handle.migrationClient());
        if (!cancelled) setState(next);
      } catch {
        // SQLite ще не піднявся (pre-auth, приватний режим) — лишаємо
        // «не знаємо». Мовчазний перехід у «свіжо» тут був би найгіршим
        // із можливих дефолтів.
        if (!cancelled) setState(unknownReplicaFreshness());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return state;
}
