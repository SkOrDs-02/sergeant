// Chat-action → SQLite bridge (`mirrorFinykChatDualWrite`): the non-hook
// path the hub AI assistant's mutators use. Asserts that a per-slice
// `prev → next` delta (1) lands in the structured `finyk_*` tables,
// (2) warms the read cache so a mounted UI re-renders, (3) records the
// `applied` outcome WITHOUT emitting a parity mismatch (a partial-slice
// write must never trip the Stage-8 parity gate), and (4) no-ops when no
// dual-write context is registered.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __clearFinykDualWriteContextForTests,
  registerFinykDualWriteContext,
  type FinykDualWriteContext,
} from "../index.js";
import { mirrorFinykChatDualWrite } from "../chatBridge.js";
import { blobsFromArray, stateWithSlice } from "../extract.js";
import {
  clearFinykSqliteCache,
  getCachedFinykSqliteState,
} from "../../sqliteReader.js";
import { __resetFinykSqliteReadGateForTests } from "../../sqliteReadGate.js";
import {
  __peekDualWriteTelemetryForTests,
  __resetDualWriteTelemetryForTests,
} from "../../../../../core/observability/dualWriteTelemetry.js";
import { createTestSqlite, type TestSqliteHandle } from "./testSqlite.js";

const USER_ID = "u-1";

let handle: TestSqliteHandle;
// Monotonic clock. The soft-delete LWW guard applies only when
// `updated_at < clientTs` (strictly newer — see adapter.ts). A rapid
// insert→delete pair driven by wall-clock `new Date()` can land both ops in
// the same millisecond, which silently drops the delete and leaves the row
// active — a flake that only surfaces under parallel load. A counter hands
// each op a strictly-increasing timestamp, so ordering is deterministic
// regardless of scheduling, matching the real world where distinct user
// actions never share a millisecond.
let clockMs = 0;

beforeEach(async () => {
  handle = await createTestSqlite();
  clockMs = Date.parse("2026-05-04T12:00:00.000Z");
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetFinykSqliteReadGateForTests();
  __resetDualWriteTelemetryForTests();
});

afterEach(() => {
  handle.close();
  __clearFinykDualWriteContextForTests();
  clearFinykSqliteCache();
  __resetDualWriteTelemetryForTests();
});

function register(): void {
  const ctx: FinykDualWriteContext = {
    getUserId: () => USER_ID,
    getMigrationClient: async () => handle.client,
    getNow: () => new Date(clockMs++).toISOString(),
  };
  registerFinykDualWriteContext(ctx);
}

describe("mirrorFinykChatDualWrite", () => {
  it("applies a manual-expense upsert to SQLite and warms the read cache", async () => {
    register();
    const tx = {
      id: "m_1",
      date: "2026-05-04T12:00:00.000Z",
      description: "Кава",
      amount: 80,
      category: "",
      type: "expense",
    };

    await mirrorFinykChatDualWrite(
      stateWithSlice("manualExpenses", blobsFromArray([])),
      stateWithSlice("manualExpenses", blobsFromArray([tx])),
    );

    const rows = await handle.client.all<{ id: string; data_json: string }>(
      "SELECT id, data_json FROM finyk_manual_expenses WHERE deleted_at IS NULL",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe("m_1");
    expect(JSON.parse(rows[0]!.data_json)).toMatchObject({
      id: "m_1",
      amount: 80,
    });

    // Read cache refreshed → the `useFinykStorageSlots` overlay would now
    // render the AI-created row instead of the stale (empty) value.
    expect(getCachedFinykSqliteState().manualExpenses.map((e) => e.id)).toEqual(
      ["m_1"],
    );
  });

  it("records the applied outcome without emitting a parity mismatch", async () => {
    register();
    // Two unrelated single-slice writes, like the AI adding a budget then a
    // debt. A partial `next` state (every other entity empty) would false-
    // mismatch the parity probe — the bridge must not run it.
    await mirrorFinykChatDualWrite(
      stateWithSlice("budgets", blobsFromArray([])),
      stateWithSlice(
        "budgets",
        blobsFromArray([
          { id: "b_1", type: "limit", categoryId: "food", limit: 100 },
        ]),
      ),
    );
    await mirrorFinykChatDualWrite(
      stateWithSlice("debts", blobsFromArray([])),
      stateWithSlice(
        "debts",
        blobsFromArray([{ id: "d_1", name: "Loan", totalAmount: 500 }]),
      ),
    );

    const telemetry = __peekDualWriteTelemetryForTests("finyk");
    expect(telemetry.applied).toBe(2);
    expect(telemetry.parityMismatch).toBe(0);
    expect(telemetry.parityMatch).toBe(0); // bridge skips the probe entirely

    // The earlier budget is untouched by the later debt write — the diff
    // only carries the mutated slice, so unrelated rows are never clobbered.
    const budgets = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_budgets WHERE deleted_at IS NULL",
    );
    const debts = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_debts WHERE deleted_at IS NULL",
    );
    expect(budgets.map((b) => b.id)).toEqual(["b_1"]);
    expect(debts.map((d) => d.id)).toEqual(["d_1"]);
  });

  it("soft-deletes on a removal delta (undo path)", async () => {
    register();
    const tx = { id: "m_1", date: "2026-05-04", description: "x", amount: 10 };
    await mirrorFinykChatDualWrite(
      stateWithSlice("manualExpenses", blobsFromArray([])),
      stateWithSlice("manualExpenses", blobsFromArray([tx])),
    );
    await mirrorFinykChatDualWrite(
      stateWithSlice("manualExpenses", blobsFromArray([tx])),
      stateWithSlice("manualExpenses", blobsFromArray([])),
    );

    const active = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_manual_expenses WHERE deleted_at IS NULL",
    );
    expect(active).toHaveLength(0);
    expect(getCachedFinykSqliteState().manualExpenses).toHaveLength(0);
  });

  it("is a no-op when no dual-write context is registered", async () => {
    // No register() — mirrors the assistant being invoked from a surface
    // where the Finyk module never mounted.
    await mirrorFinykChatDualWrite(
      stateWithSlice("debts", blobsFromArray([])),
      stateWithSlice(
        "debts",
        blobsFromArray([{ id: "d_1", name: "X", totalAmount: 10 }]),
      ),
    );
    const rows = await handle.client.all<{ id: string }>(
      "SELECT id FROM finyk_debts",
    );
    expect(rows).toHaveLength(0);
    expect(__peekDualWriteTelemetryForTests("finyk").applied).toBe(0);
  });
});
