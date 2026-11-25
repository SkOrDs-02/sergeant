import { describe, expect, it, vi } from "vitest";

import type { SyncV2PushResponse } from "./syncV2";
import {
  runSyncEnginePushOnce,
  type DrainedOutboxRowShape,
  type MarkOutboxRetryFn,
  type SyncEnginePushDeps,
} from "./syncV2.pushLoop";

// data-51 / rv-sync-clock: годинник пристрою, що поспішає.
//
// 1. Сервер обрізає `client_ts` до `server_now` і повертає записану мітку в
//    `result.client_ts`. Цикл мусить віддати її харнесу ДО ack, інакше
//    пристрій лишається з міткою з майбутнього і розходиться з рештою.
// 2. `retry / clock_skew` не палить спроби: повтор із тією ж міткою пройде,
//    щойно годинник сервера її наздожене. Доти бекоф 1→512 с доводив
//    пристрій, що поспішає на ~20 хв, до `dead_letter`.

const NOW = new Date("2026-11-21T12:00:00.000Z");
const IDEM = "fixture-clockskew-001"; // gitleaks:allow

function row(
  overrides: Partial<DrainedOutboxRowShape> = {},
): DrainedOutboxRowShape {
  return {
    id: 1,
    table: "routine_habits",
    op: "update",
    row: { id: "h-1", user_id: "u-1", name: "x" },
    clientTs: "2026-11-21T12:01:30.000Z",
    idempotencyKey: IDEM,
    attempts: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: "2026-11-21T12:01:30.000Z",
    ...overrides,
  };
}

function deps(
  drained: DrainedOutboxRowShape[],
  response: SyncV2PushResponse,
  extra: Partial<SyncEnginePushDeps> = {},
) {
  const calls: string[] = [];
  const markRetry = vi.fn<MarkOutboxRetryFn>(async () => {});
  const adoptStoredClientTs = vi.fn(async () => {
    calls.push("adopt");
  });
  const markSuccess = vi.fn(async () => {
    calls.push("ack");
  });
  const d: SyncEnginePushDeps = {
    drain: vi.fn(async () => drained),
    push: vi.fn(async () => response),
    markSuccess,
    markRetry,
    markRejected: vi.fn(async () => {}),
    planRetry: (previousAttempts, now, lastError) => ({
      attempts: previousAttempts + 1,
      status: previousAttempts + 1 >= 10 ? "dead_letter" : "pending",
      nextRetryAt:
        previousAttempts + 1 >= 10
          ? null
          : new Date(now.getTime() + 1_000).toISOString(),
      lastError,
    }),
    now: () => NOW,
    adoptStoredClientTs,
    ...extra,
  };
  return { d, calls, markRetry, adoptStoredClientTs, markSuccess };
}

describe("runSyncEnginePushOnce — обрізана мітка (data-51)", () => {
  it("applied з client_ts, відмінним від надісланого: харнес отримує мітку до ack", async () => {
    const r = row();
    const { d, calls, adoptStoredClientTs } = deps([r], {
      accepted: 1,
      last_op_id: 5,
      results: [
        {
          idempotency_key: IDEM,
          status: "applied",
          client_ts: NOW.toISOString(),
        },
      ],
    });
    const out = await runSyncEnginePushOnce(d, { limit: 10 });
    expect(out.pushed).toBe(1);
    expect(adoptStoredClientTs).toHaveBeenCalledWith(r, NOW.toISOString());
    expect(calls).toEqual(["adopt", "ack"]);
  });

  it("без поля або з тією самою міткою харнес не викликається", async () => {
    const r = row();
    const { d, adoptStoredClientTs } = deps(
      [r, row({ id: 2, idempotencyKey: "k2" })],
      {
        accepted: 2,
        last_op_id: 6,
        results: [
          { idempotency_key: IDEM, status: "applied" },
          {
            idempotency_key: "k2",
            status: "applied",
            // Той самий момент в іншому записі.
            client_ts: "2026-11-21T12:01:30Z",
          },
        ],
      },
    );
    await runSyncEnginePushOnce(d, { limit: 10 });
    expect(adoptStoredClientTs).not.toHaveBeenCalled();
  });

  it("збій харнесу не підтверджує рядок: повтор дасть applied з тією ж міткою", async () => {
    const { d, markSuccess } = deps(
      [row()],
      {
        accepted: 1,
        last_op_id: 5,
        results: [
          {
            idempotency_key: IDEM,
            status: "applied",
            client_ts: NOW.toISOString(),
          },
        ],
      },
      {
        adoptStoredClientTs: async () => {
          throw new Error("SQLITE_BUSY");
        },
      },
    );
    await expect(runSyncEnginePushOnce(d, { limit: 10 })).rejects.toThrow(
      "SQLITE_BUSY",
    );
    expect(markSuccess).not.toHaveBeenCalled();
  });
});

describe("runSyncEnginePushOnce — retry/clock_skew (data-51)", () => {
  it("не палить спроби і чекає, поки сервер наздожене client_ts", async () => {
    const { d, markRetry } = deps(
      [row({ attempts: 9, clientTs: "2026-11-21T12:03:00.000Z" })],
      {
        accepted: 0,
        last_op_id: 0,
        server_now: NOW.toISOString(),
        results: [
          { idempotency_key: IDEM, status: "retry", reason: "clock_skew" },
        ],
      },
    );
    const out = await runSyncEnginePushOnce(d, { limit: 10 });
    expect(out.retried).toBe(1);
    expect(markRetry.mock.calls[0]![1]).toEqual({
      attempts: 9,
      status: "pending",
      nextRetryAt: new Date(NOW.getTime() + 3 * 60_000).toISOString(),
      lastError: "server_retry:clock_skew",
    });
  });

  it("пристрій на 20 хв попереду: чекає не довше 5 хв і не йде в dead_letter", async () => {
    const { d, markRetry } = deps(
      [row({ attempts: 9, clientTs: "2026-11-21T12:20:00.000Z" })],
      {
        accepted: 0,
        last_op_id: 0,
        server_now: NOW.toISOString(),
        results: [
          { idempotency_key: IDEM, status: "retry", reason: "clock_skew" },
        ],
      },
    );
    await runSyncEnginePushOnce(d, { limit: 10 });
    expect(markRetry.mock.calls[0]![1]).toMatchObject({
      attempts: 9,
      status: "pending",
      nextRetryAt: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    });
  });
});
