/**
 * Аудит 2026-10-01, data-07: адаптер ставив рядок outbox fire-and-forget
 * (`void enqueueOutboxUpsert`), тож `await applyFinykDualWriteOps` вертався,
 * поки серіалізований ланцюг enqueue ще крутився, і `window.location.reload()`
 * після відновлення з файлу обривав його (на сервер доходило 103 з 300 рядків).
 * Тепер адаптер чекає enqueue: застосування завершується разом з outbox.
 */
import { describe, expect, it, vi } from "vitest";
import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";

let releaseEnqueue: () => void = () => {};
const enqueueSpy = vi.fn(
  () =>
    new Promise<{ id: number; inserted: boolean }>((resolve) => {
      releaseEnqueue = () => resolve({ id: 1, inserted: true });
    }),
);
vi.mock("../../../../core/syncEngine/enqueueOutboxUpsert.js", () => ({
  enqueueOutboxUpsert: () => enqueueSpy(),
}));

import { applyFinykDualWriteOps } from "./adapter";

const client = {
  run: vi.fn(async () => undefined),
} as unknown as SqliteMigrationClient;

describe("finyk adapter: enqueue у outbox чекається", () => {
  it("applyFinykDualWriteOps не резолвиться, доки enqueue не завершився", async () => {
    let done = false;
    const pending = applyFinykDualWriteOps(
      client,
      [{ kind: "blob-delete", table: "finyk_manual_expenses", id: "e1" }],
      { userId: "u1", clientTs: "2026-10-01T00:00:00.000Z" },
    ).then((r) => {
      done = true;
      return r;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    releaseEnqueue();
    await expect(pending).resolves.toEqual({
      applied: 1,
      errored: 0,
      skipped: 0,
    });
  });

  it("збій enqueue проковтується, як і раніше: застосування не падає", async () => {
    enqueueSpy.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    await expect(
      applyFinykDualWriteOps(
        client,
        [{ kind: "blob-delete", table: "finyk_manual_expenses", id: "e2" }],
        { userId: "u1", clientTs: "2026-10-01T00:00:00.000Z" },
      ),
    ).resolves.toMatchObject({ applied: 1, errored: 0 });
  });
});
