/**
 * Unit-тести для PR #041 SSE stream — частини, які не залежать від
 * реального Postgres. Postgres-backed E2E-тест (real push → live SSE
 * → multi-tab fan-out) живе в `syncV2.integration.test.ts` під
 * `vitest.integration.config.ts`, який запускається через
 * `pnpm test:integration`.
 *
 * Тут перевіряємо:
 *   - SSE wire-формат `formatSseFrame` / `formatSseHeartbeat` (rfc-stable),
 *   - in-process emitter `opLogEmitter` / `notifySyncV2OpsApplied`
 *     (subscribe → emit → unsubscribe → no-op),
 *   - стабільні константи `SYNC_V2_STREAM_HEARTBEAT_MS` /
 *     `SYNC_V2_STREAM_REPLAY_LIMIT` — ламати їх ціною мовчазного
 *     proxy-disconnect-у або replay-truncate-сюрпризу клієнту.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SYNC_V2_STREAM_HEARTBEAT_MS,
  SYNC_V2_STREAM_REPLAY_LIMIT,
  formatSseFrame,
  formatSseHeartbeat,
  notifySyncV2OpsApplied,
  opLogEmitter,
  type SyncV2StreamOp,
} from "./syncV2Stream.js";

const SAMPLE_OP: SyncV2StreamOp = {
  id: 42,
  table: "routine_entries",
  op: "insert",
  row: { id: "abc", title: "Meditate" },
  client_ts: "2026-05-04T10:00:00.000+00:00",
  server_ts: "2026-05-04T10:00:00.500+00:00",
  origin_device_id: "device-A",
};

afterEach(() => {
  // Емітер — singleton; чистимо за собою, щоб тест-runs не leak-али
  // listener-и між it()-блоками.
  opLogEmitter.removeAllListeners();
});

describe("SSE wire format", () => {
  it("formatSseFrame emits id+event+data with trailing blank line", () => {
    const frame = formatSseFrame("op", { x: 1 }, 7);
    expect(frame).toBe(`id: 7\nevent: op\ndata: {"x":1}\n\n`);
  });

  it("formatSseFrame omits id line when not provided", () => {
    const frame = formatSseFrame("hello", { since: 0 });
    expect(frame).toBe(`event: hello\ndata: {"since":0}\n\n`);
  });

  it("formatSseFrame stringifies arbitrary JSON-serializable payloads", () => {
    const frame = formatSseFrame("op", SAMPLE_OP, SAMPLE_OP.id);
    // Single-line data — критично, бо blank line закінчує SSE-event.
    expect(frame).toMatch(/^id: 42\nevent: op\ndata: \{.*\}\n\n$/);
    expect(frame).toContain('"id":42');
    expect(frame).toContain('"table":"routine_entries"');
    expect(frame).toContain('"origin_device_id":"device-A"');
  });

  it("formatSseFrame accepts string ids (Last-Event-ID is text)", () => {
    expect(formatSseFrame("op", { x: 1 }, "alpha")).toContain("id: alpha\n");
  });

  it("formatSseHeartbeat emits a comment line that clients ignore", () => {
    expect(formatSseHeartbeat()).toBe(": heartbeat\n\n");
  });
});

describe("opLogEmitter / notifySyncV2OpsApplied", () => {
  it("delivers applied ops to per-user channel listeners", () => {
    const received: SyncV2StreamOp[][] = [];
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      received.push([...ops]);
    });

    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual([SAMPLE_OP]);
  });

  it("does not cross-deliver between users", () => {
    const aliceReceived: SyncV2StreamOp[][] = [];
    const bobReceived: SyncV2StreamOp[][] = [];
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      aliceReceived.push([...ops]);
    });
    opLogEmitter.on("user:bob", (ops: readonly SyncV2StreamOp[]) => {
      bobReceived.push([...ops]);
    });

    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);

    expect(aliceReceived).toHaveLength(1);
    expect(bobReceived).toHaveLength(0);
  });

  it("is a no-op for empty applied[] (skips channel emit)", () => {
    const received: SyncV2StreamOp[][] = [];
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      received.push([...ops]);
    });

    notifySyncV2OpsApplied("alice", []);

    expect(received).toHaveLength(0);
  });

  it("supports multiple listeners per user (multi-tab fan-out)", () => {
    const tab1: SyncV2StreamOp[][] = [];
    const tab2: SyncV2StreamOp[][] = [];
    const tab3: SyncV2StreamOp[][] = [];
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      tab1.push([...ops]);
    });
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      tab2.push([...ops]);
    });
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      tab3.push([...ops]);
    });

    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);

    expect(tab1).toHaveLength(1);
    expect(tab2).toHaveLength(1);
    expect(tab3).toHaveLength(1);
  });

  it("unsubscribe stops further delivery", () => {
    const received: SyncV2StreamOp[][] = [];
    const listener = (ops: readonly SyncV2StreamOp[]): void => {
      received.push([...ops]);
    };
    opLogEmitter.on("user:alice", listener);

    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);
    expect(received).toHaveLength(1);

    opLogEmitter.off("user:alice", listener);
    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);
    expect(received).toHaveLength(1);
  });

  it("listener exception is isolated by EventEmitter — but documented", () => {
    // Node's EventEmitter rethrows synchronously by default. Push-handler
    // must not crash from one bad SSE-listener; the production
    // implementation в `notifySyncV2OpsApplied` catches the throw і
    // logs warn-ом. Цей тест локає очікування, що `notify*` не кидає
    // за межі своєї функції, незалежно від поведінки listener-ів.
    opLogEmitter.on("user:alice", () => {
      throw new Error("listener boom");
    });
    const goodReceived: SyncV2StreamOp[][] = [];
    opLogEmitter.on("user:alice", (ops: readonly SyncV2StreamOp[]) => {
      goodReceived.push([...ops]);
    });

    expect(() => notifySyncV2OpsApplied("alice", [SAMPLE_OP])).not.toThrow();
    // good listener порядок не гарантований після throwing-listener-а
    // (Node aborts emit при першому throw), тому goodReceived може бути 0.
    // Контракт — `notifySyncV2OpsApplied` not-throw — головне.
  });

  it("supports >> default 10 listeners (multi-device pile-up)", () => {
    // Production допускає 1000 listener-ів (`setMaxListeners`); тут
    // перевіряємо, що 50 листенерів не emit-ять MaxListenersExceeded
    // warning-у — для warn-spy-ю використовуємо process.emitWarning.
    const warningSpy = vi.spyOn(process, "emitWarning");
    for (let i = 0; i < 50; i++) {
      opLogEmitter.on("user:alice", () => undefined);
    }
    notifySyncV2OpsApplied("alice", [SAMPLE_OP]);
    const maxListenersWarning = warningSpy.mock.calls.find(
      (call) =>
        typeof call[0] === "object" &&
        call[0] !== null &&
        "name" in call[0] &&
        (call[0] as { name: string }).name === "MaxListenersExceededWarning",
    );
    expect(maxListenersWarning).toBeUndefined();
    warningSpy.mockRestore();
  });
});

describe("constants", () => {
  it("heartbeat is below typical proxy idle-timeout", () => {
    // Vercel/Cloudflare/nginx default idle-таймаут — 30s. Гарантуємо
    // ≥ 5s запасу, тобто <=25s heartbeat.
    expect(SYNC_V2_STREAM_HEARTBEAT_MS).toBeLessThanOrEqual(25_000);
    expect(SYNC_V2_STREAM_HEARTBEAT_MS).toBeGreaterThanOrEqual(5_000);
  });

  it("replay limit matches /pull max — клієнт reuse-ає той самий cursor", () => {
    // PR #021: SYNC_V2_PULL_MAX_LIMIT = 500. Ламати парність — означає
    // дозволити stream дати backlog більший за один pull-batch, що
    // непотрібно і незрозуміло клієнту.
    expect(SYNC_V2_STREAM_REPLAY_LIMIT).toBe(500);
  });
});
