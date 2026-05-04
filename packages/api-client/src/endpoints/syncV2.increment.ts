import type { SyncV2PushOp } from "./syncV2";

/**
 * Client-side typed builder для PN-counter `op='increment'` push-envelope-у,
 * що дзеркалить серверні validation-rule-и з
 * `apps/server/src/modules/sync/syncV2.ts`:
 *
 * - **Allowlist** — `INCREMENT_OP_SUPPORTED_TABLES` віддзеркалює серверну
 *   константу. Engine-gate на сервері (PR #042a) реджектить `op='increment'`
 *   проти будь-якої not-allowlisted-таблиці з `reason='op_not_supported'`,
 *   тому клієнтський build-step «вирубає» такі push-и ще до мережі —
 *   локально, без round-trip-у.
 * - **Delta-validation** — три перевірки в тому самому порядку, що apply-fn-у
 *   на сервері (`applyRoutineStreaks` → `missing_delta` → `invalid_delta`),
 *   тому повертаємо ту саму string-літеральну причину, яку б повернув
 *   сервер. Це робить клієнтський reject-shape однорідним із серверним
 *   логом / метрикою `sync_op_log_apply_total{reason}`.
 * - **Magnitude bound** — `INCREMENT_DELTA_MAX_ABS = 1000` (мірорить
 *   серверний `INCREMENT_DELTA_MAX_ABS` із `syncV2.ts`). Захист від
 *   `delta=Number.MAX_SAFE_INTEGER` corruption-у counter-а.
 *
 * Завжди повертає Result-discriminated-union (а не throw-ить), щоб caller-и
 * могли пайпити helper-output безпосередньо в outbox-метрику з тими ж
 * reason-string-ами, що сервер пише в `sync_op_log.reject_reason`. Той
 * самий патерн, що `apps/web/src/modules/finyk/lib/conflicts/store.ts`
 * пушить `reason: 'lww_conflict' | 'tombstoned'` із серверних reject-результатів.
 *
 * Stage 5 PR #042c (`docs/planning/storage-roadmap.md`). Ще не має
 * callsite-у — кладемо в api-client як public surface для майбутнього
 * client-side push-loop-у; сервер-side allowlist (`routine_streaks`) і
 * delta-bound (1000) тримаємо в синхроні через regression-тест нижче +
 * cross-link у JSDoc.
 */

export const INCREMENT_OP_SUPPORTED_TABLES = ["routine_streaks"] as const;

export type IncrementOpTable = (typeof INCREMENT_OP_SUPPORTED_TABLES)[number];

export const INCREMENT_DELTA_MAX_ABS = 1000;

export type BuildSyncV2IncrementOpReason =
  | "op_not_supported"
  | "missing_delta"
  | "invalid_delta";

export interface BuildSyncV2IncrementOpInput {
  /**
   * Назва таблиці. Має бути у `INCREMENT_OP_SUPPORTED_TABLES`, інакше
   * helper повертає `op_not_supported` без побудови envelope-у.
   */
  readonly table: string;
  /**
   * PN-counter крок. Допустимі значення — finite integer у діапазоні
   * `[-INCREMENT_DELTA_MAX_ABS, +INCREMENT_DELTA_MAX_ABS]`. `null` або
   * `undefined` дають `missing_delta` (точно як сервер у
   * `applyRoutineStreaks`); non-finite / non-integer / out-of-range —
   * `invalid_delta` (collapsed reason — сервер так само не розрізняє).
   */
  readonly delta: number | null | undefined;
  /** ISO-8601 client-clock timestamp; пишеться у `client_ts`. */
  readonly clientTs: string;
  /**
   * ULID/UUID, унікальний у межах `(user_id, idempotency_key)`. Empty
   * string не валідуємо тут — сервер відхилить його через zod-схему
   * push-body-а; нам важливо лиш, щоб delta-validation семантика
   * лишалась bit-for-bit ідентичною серверній.
   */
  readonly idempotencyKey: string;
  /**
   * Опційні додаткові поля у `row` (наприклад `user_id` для cross-user
   * sanity-check, хоча сервер однаково перетирає його authenticated
   * user-ом). `delta` сюди передавати не треба — helper кладе його сам.
   */
  readonly extraRow?: Readonly<Record<string, unknown>>;
}

export type BuildSyncV2IncrementOpResult =
  | { readonly ok: true; readonly op: SyncV2PushOp }
  | { readonly ok: false; readonly reason: BuildSyncV2IncrementOpReason };

/**
 * Type-guard: чи опт-іна `table` у PN-counter allowlist? Експортуємо
 * окремо, щоб caller-и могли робити early-exit ще до того, як зібрали
 * всі поля input-у (наприклад, у тіні диспетчера, який мапить
 * generic-LWW-op у increment-op для PN-counter-tier-таблиць).
 */
export function isIncrementOpSupported(
  table: string,
): table is IncrementOpTable {
  // O(N) над 1-елементним tuple-ом сьогодні; Set-conversion забирає
  // більше memory-у, ніж економить часу при такому розмірі. Якщо
  // allowlist виросте >~10 — переписати на pre-built Set.
  return (INCREMENT_OP_SUPPORTED_TABLES as readonly string[]).includes(table);
}

/**
 * Зібрати валідне `SyncV2PushOp` з `op='increment'`. Не throw-ить
 * — повертає discriminated union із серверно-сумісними reject reasons.
 *
 * Контракт ідентичний серверній apply-стороні (`applyRoutineStreaks`
 * у `apps/server/src/modules/sync/syncV2.ts`):
 *
 * 1. `table ∉ INCREMENT_OP_SUPPORTED_TABLES` → `op_not_supported`.
 * 2. `delta == null` → `missing_delta`.
 * 3. Не number / не finite / не integer / `|delta| > INCREMENT_DELTA_MAX_ABS`
 *    → `invalid_delta` (сервер colapse-ить ці чотири підкейси у одну
 *    причину; ми робимо так само, щоб метрики
 *    `sync_op_log_apply_total{reason}` мали однакову cardinality на
 *    клієнтсько-логованих rejects vs server-логованих).
 *
 * Happy-path кладе `delta` у `row` поверх будь-яких полів, переданих у
 * `extraRow`, тому caller не може випадково перетерти його чимось
 * іншим.
 */
export function buildSyncV2IncrementOp(
  input: BuildSyncV2IncrementOpInput,
): BuildSyncV2IncrementOpResult {
  const { table, delta, clientTs, idempotencyKey, extraRow } = input;

  if (!isIncrementOpSupported(table)) {
    return { ok: false, reason: "op_not_supported" };
  }
  if (delta == null) {
    return { ok: false, reason: "missing_delta" };
  }
  if (
    typeof delta !== "number" ||
    !Number.isFinite(delta) ||
    !Number.isInteger(delta) ||
    Math.abs(delta) > INCREMENT_DELTA_MAX_ABS
  ) {
    return { ok: false, reason: "invalid_delta" };
  }

  const row = { ...(extraRow ?? {}), delta };

  return {
    ok: true,
    op: {
      table,
      op: "increment",
      row,
      client_ts: clientTs,
      idempotency_key: idempotencyKey,
    },
  };
}
