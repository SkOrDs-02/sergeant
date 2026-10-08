/**
 * Аудит 2026-10-01, data-07: те саме, що й для Фініка
 * (`finyk/lib/sqliteWriter/adapter.outboxAwait.test.ts`): `void
 * enqueueOutboxUpsert` лишав хвіст outbox, який reload після відновлення з
 * файлу обривав. Адаптер Фізрука тепер чекає enqueue.
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

import { applyFizrukDualWriteOps } from "./adapter";

const client = {
  run: vi.fn(async () => undefined),
  all: vi.fn(async () => []),
} as unknown as SqliteMigrationClient;

describe("fizruk adapter: enqueue у outbox чекається", () => {
  it("applyFizrukDualWriteOps не резолвиться, доки enqueue не завершився", async () => {
    let done = false;
    const pending = applyFizrukDualWriteOps(
      client,
      [{ kind: "measurement-delete", measurementId: "m1" }],
      { userId: "u1", clientTs: "2026-10-01T00:00:00.000Z" },
    ).then((r) => {
      done = true;
      return r;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(done).toBe(false);

    releaseEnqueue();
    await expect(pending).resolves.toMatchObject({ applied: 1, errored: 0 });
  });
});
