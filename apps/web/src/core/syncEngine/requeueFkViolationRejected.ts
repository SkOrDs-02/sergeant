/**
 * Повторна відправка оп-ів, які старий сервер відхилив як `fk_violation`
 * через «чужий рядок із тим самим id» (аудит 2026-10-01, `data-01`).
 *
 * Чому це потрібно. До міграції `162_sync_pk_per_user` (#1594) PK sync-таблиць
 * був глобальним `(id)`, тож детермінований id (`pe::initial::home::…`,
 * `rcp_ai_*`, `Date.now()`) іншого користувача давав `rejected / fk_violation`.
 * Для outbox це ТЕРМІНАЛЬНА відмова: `status='rejected'`, ніколи не ретраїться.
 * Тепер сервер такий рядок приймає, але застряглі оп-и самі не поїдуть.
 *
 * Що робимо. Рядок переводиться назад у `pending` НА МІСЦІ: payload і `client_ts`
 * ті самі (LWW лишається чесним), `attempts`/`next_retry_at`/`last_error`
 * скинуто, `idempotency_key` НОВИЙ (відхилений оп лежить у `sync_op_log`, і
 * повтор старого ключа сервер віддав би як `duplicate` зі старою відмовою).
 * Береться лише `status='rejected' AND reject_reason='fk_violation'`:
 * `quarantined` / `dead_letter` не чіпаємо, тож карантин не обходиться.
 *
 * Клієнт не відрізняє «чужий рядок» від «чужого/відсутнього БАТЬКА»
 * (`fizruk_workout_items`/`sets`, `guardParentOwned` досі віддає `fk_violation`).
 * Тому повторюємо всі, а ті, що впадуть знову, лишаються `rejected`.
 *
 * Порядок деплою. Vercel викочує фронт раніше за бекенд (~25 хв): якщо
 * перепостановка спрацює до нового сервера, старий знову відхилить оп. Тому
 * жодного «поставив маркер і забув»: стан у сховищі тримає id перепоставлених
 * рядків, і «готово» ставиться лише коли їх більше немає в outbox (сервер
 * прийняв, рядок видалено), або нема чого повторювати після реальної спроби,
 * або вичерпано `MAX_RUNS` (решта справді термінальні). Спроби рознесено на
 * `MIN_GAP_MS`, щоб кілька бутів у вікні деплою не з'їли всі за хвилину;
 * рядки в польоті (`pending`) чекаємо. Петлі немає: максимум `MAX_RUNS`
 * прогонів на пристрій і вікно `WINDOW_MS`, після якого крок згасає (до того
 * ж він ловить рядки, відхилені старим сервером уже ПІСЛЯ першого буту).
 */

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

export const FK_REQUEUE_STATE_KEY = "sync_fk_violation_requeue_v1";
export const FK_REQUEUE_REASON = "fk_violation";
export const FK_REQUEUE_MAX_RUNS = 3;
export const FK_REQUEUE_MIN_GAP_MS = 60 * 60 * 1000;
export const FK_REQUEUE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface FkRequeueState {
  readonly startedMs: number;
  readonly runs: number;
  readonly lastRunMs: number;
  readonly ids: readonly number[];
  readonly done: boolean;
}

export interface FkRequeueResult {
  readonly requeued: number;
  readonly outcome: "done" | "waiting" | "requeued" | "idle";
}

function readState(): FkRequeueState | null {
  const raw = safeReadLS<Partial<FkRequeueState>>(FK_REQUEUE_STATE_KEY, null);
  if (raw === null || typeof raw !== "object") return null;
  if (typeof raw.startedMs !== "number") return null;
  return {
    startedMs: raw.startedMs,
    runs: typeof raw.runs === "number" ? raw.runs : 0,
    lastRunMs: typeof raw.lastRunMs === "number" ? raw.lastRunMs : 0,
    ids: Array.isArray(raw.ids)
      ? raw.ids.filter((n): n is number => Number.isSafeInteger(n))
      : [],
    done: raw.done === true,
  };
}

export async function requeueFkViolationRejected(
  client: SqliteMigrationClient,
  nowMs: number = Date.now(),
): Promise<FkRequeueResult> {
  const state: FkRequeueState = readState() ?? {
    startedMs: nowMs,
    runs: 0,
    lastRunMs: 0,
    ids: [],
    done: false,
  };
  if (state.done) return { requeued: 0, outcome: "done" };
  const save = (next: Partial<FkRequeueState>): void => {
    safeWriteLS(FK_REQUEUE_STATE_KEY, { ...state, ...next });
  };

  // Перепоставлені рядки, які ще чекають відправки, не чіпаємо і не рахуємо.
  let inflight = 0;
  if (state.ids.length > 0) {
    const placeholders = state.ids.map(() => "?").join(", ");
    const rows = await client.all<{ n: number | bigint }>(
      `SELECT COUNT(*) AS n FROM sync_op_outbox
        WHERE status = 'pending' AND id IN (${placeholders})`,
      [...state.ids],
    );
    inflight = Number(rows[0]?.n ?? 0);
  }
  if (inflight > 0) {
    save({});
    return { requeued: 0, outcome: "waiting" };
  }

  const rejected = await client.all<{ id: number | bigint }>(
    `SELECT id FROM sync_op_outbox
      WHERE status = 'rejected' AND reject_reason = ?
      ORDER BY id`,
    [FK_REQUEUE_REASON],
  );

  if (rejected.length === 0) {
    // Нічого повторювати. Після реальної спроби готово; без спроби чекаємо
    // вікно: старий сервер ще міг відхилити рядок ПІСЛЯ цього буту.
    if (state.runs > 0 || nowMs - state.startedMs > FK_REQUEUE_WINDOW_MS) {
      save({ done: true, ids: [] });
      return { requeued: 0, outcome: "done" };
    }
    save({});
    return { requeued: 0, outcome: "idle" };
  }

  if (
    state.runs >= FK_REQUEUE_MAX_RUNS ||
    nowMs - state.startedMs > FK_REQUEUE_WINDOW_MS
  ) {
    // Решта справді термінальні (чужий батько тощо): лишаємо `rejected`.
    save({ done: true, ids: [] });
    return { requeued: 0, outcome: "done" };
  }
  if (state.runs > 0 && nowMs - state.lastRunMs < FK_REQUEUE_MIN_GAP_MS) {
    save({});
    return { requeued: 0, outcome: "waiting" };
  }

  const ids: number[] = [];
  for (const entry of rejected) {
    const id = Number(entry.id);
    if (!Number.isSafeInteger(id)) continue;
    await client.run(
      `UPDATE sync_op_outbox
          SET status = 'pending',
              reject_reason = NULL,
              attempts = 0,
              next_retry_at = NULL,
              last_error = NULL,
              idempotency_key = ?
        WHERE id = ? AND status = 'rejected' AND reject_reason = ?`,
      [crypto.randomUUID(), id, FK_REQUEUE_REASON],
    );
    ids.push(id);
  }
  save({ runs: state.runs + 1, lastRunMs: nowMs, ids });
  return { requeued: ids.length, outcome: "requeued" };
}
