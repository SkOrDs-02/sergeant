import { describe, it, expect } from "vitest";
import {
  INCREMENT_DELTA_MAX_ABS,
  INCREMENT_OP_SUPPORTED_TABLES,
  buildSyncV2IncrementOp,
  isIncrementOpSupported,
} from "./syncV2.increment";

// Контракт цього helper-у — bit-for-bit дзеркало серверного
// `applyRoutineStreaks` + engine-gate-у з
// `apps/server/src/modules/sync/syncV2.ts`. Будь-яка драфт-цьому
// constants-параметра (allowlist, MAX_ABS) має фейлити цей файл,
// інакше клієнт почне відправляти push-и, які сервер відхилить
// engine-level — тобто витрата мережі / outbox-buffer-а на guaranteed
// reject. Тому константи перевіряємо як public surface (а не імпорт-
// shaped behind помилкою — допустимий drift).
describe("INCREMENT_OP_SUPPORTED_TABLES", () => {
  it("містить routine_streaks (PR #042b server-side allowlist)", () => {
    expect(INCREMENT_OP_SUPPORTED_TABLES).toContain("routine_streaks");
  });

  it("регресійний lock на розмір allowlist (drift-tripwire)", () => {
    // PR #042c: 1 таблиця (routine_streaks). Якщо допишемо нову
    // PN-counter-таблицю (PR #042x+), цей assert треба бампити в тій
    // самій PR-ці, що додає apply-fn у сервері. Pattern уже
    // використовується для `OP_LOG_TABLE_REGISTRY` / `APPLY_REJECT_REASONS`.
    expect(INCREMENT_OP_SUPPORTED_TABLES.length).toBe(1);
  });
});

describe("INCREMENT_DELTA_MAX_ABS", () => {
  it("відповідає серверній константі (1000)", () => {
    // Hard-coded mirror; зміна на сервері без зміни тут призведе до
    // того, що клієнт почне приймати delta=1500 локально, але сервер
    // буде реджектити з reason='invalid_delta' — silent budget burn.
    expect(INCREMENT_DELTA_MAX_ABS).toBe(1000);
  });
});

describe("isIncrementOpSupported", () => {
  it("true для opt-in таблиці", () => {
    expect(isIncrementOpSupported("routine_streaks")).toBe(true);
  });

  it("false для not-allowlisted таблиці", () => {
    expect(isIncrementOpSupported("routine_entries")).toBe(false);
    expect(isIncrementOpSupported("finyk_manual_expenses")).toBe(false);
    expect(isIncrementOpSupported("")).toBe(false);
  });
});

describe("buildSyncV2IncrementOp — happy path", () => {
  it("повертає ok=true з валідним SyncV2PushOp envelope-ом", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });

    expect(result).toEqual({
      ok: true,
      op: {
        table: "routine_streaks",
        op: "increment",
        row: { delta: 1 },
        client_ts: "2026-05-04T12:00:00.000Z",
        idempotency_key: "01HXZW8K6T7N4QV5R3J2P1G8AB",
      },
    });
  });

  it("приймає delta=0 (no-op increment, але валідне ціле)", () => {
    // Server-side: 0 — finite integer, |0| <= 1000 → applied. Клієнт
    // не повинен реджектити це локально, бо інакше caller втратить
    // право посилати zero-delta heartbeat-и.
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 0,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.op.row).toEqual({ delta: 0 });
    }
  });

  it("приймає негативну delta (decrement, |delta| <= MAX_ABS)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: -1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.op.row).toEqual({ delta: -1 });
    }
  });

  it("приймає граничну delta = +INCREMENT_DELTA_MAX_ABS", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: INCREMENT_DELTA_MAX_ABS,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result.ok).toBe(true);
  });

  it("приймає граничну delta = -INCREMENT_DELTA_MAX_ABS", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: -INCREMENT_DELTA_MAX_ABS,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result.ok).toBe(true);
  });

  it("кладе delta у row ПОВЕРХ extraRow-у (caller не може перетерти)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 5,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
      extraRow: { delta: 999, user_id: "u-1" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.op.row).toEqual({ delta: 5, user_id: "u-1" });
    }
  });

  it("пропускає extraRow-поля без delta (наприклад user_id) у envelope", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
      extraRow: { user_id: "u-1" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.op.row).toEqual({ delta: 1, user_id: "u-1" });
    }
  });
});

describe("buildSyncV2IncrementOp — reject reasons (server-mirrored)", () => {
  it("op_not_supported — таблиця поза INCREMENT_OP_SUPPORTED_TABLES", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_entries",
      delta: 1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "op_not_supported" });
  });

  it("op_not_supported — порожня таблиця", () => {
    const result = buildSyncV2IncrementOp({
      table: "",
      delta: 1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "op_not_supported" });
  });

  it("missing_delta — delta = null", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: null,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "missing_delta" });
  });

  it("missing_delta — delta = undefined", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: undefined,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "missing_delta" });
  });

  it("invalid_delta — delta = NaN", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: Number.NaN,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  it("invalid_delta — delta = Infinity", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: Number.POSITIVE_INFINITY,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  it("invalid_delta — delta = -Infinity", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: Number.NEGATIVE_INFINITY,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  it("invalid_delta — non-integer (1.5)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: 1.5,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  it("invalid_delta — |delta| > INCREMENT_DELTA_MAX_ABS (поза bound)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: INCREMENT_DELTA_MAX_ABS + 1,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  it("invalid_delta — Number.MAX_SAFE_INTEGER (DoS-захист)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: Number.MAX_SAFE_INTEGER,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });

  // Cast-ом обходимо TypeScript-bound на `delta: number`, бо у runtime
  // нам прилітає JSON; type-system на client-side не гарантує, що
  // caller-и з .ts-кодом не ллють у нас payload із non-number.
  it("invalid_delta — non-number runtime-payload (string)", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: "1" as unknown as number,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "invalid_delta" });
  });
});

describe("buildSyncV2IncrementOp — early-exit ordering", () => {
  // Замикаємо ordering: allowlist-check ПЕРЕД delta-validation, бо
  // інакше caller із value-у форми "delta=NaN, table=invalid" отримає
  // `invalid_delta` замість `op_not_supported` — і це не матчиться з
  // серверним early-exit-ом в engine-gate-і (який спрацьовує до того,
  // як SAVEPOINT відкриється для apply-fn-у).
  it("op_not_supported перекриває invalid_delta", () => {
    const result = buildSyncV2IncrementOp({
      table: "not_a_real_table",
      delta: Number.NaN,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "op_not_supported" });
  });

  it("missing_delta перекриває invalid_delta-форму null cast-у", () => {
    const result = buildSyncV2IncrementOp({
      table: "routine_streaks",
      delta: null,
      clientTs: "2026-05-04T12:00:00.000Z",
      idempotencyKey: "01HXZW8K6T7N4QV5R3J2P1G8AB",
    });
    expect(result).toEqual({ ok: false, reason: "missing_delta" });
  });
});
