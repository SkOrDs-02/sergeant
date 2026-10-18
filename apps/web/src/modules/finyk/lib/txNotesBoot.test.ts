import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const importLegacyTxNotesFromLs = vi.fn(async (..._a: unknown[]) => {
  calls.push("import");
  return { imported: 0, drained: true };
});
const requeueTxNotesRejectedByOldServer = vi.fn(async (..._a: unknown[]) => {
  calls.push("requeue");
  return { requeued: 0, remaining: 0 };
});

vi.mock("./txNotesLsImport.js", () => ({
  importLegacyTxNotesFromLs: (...a: unknown[]) =>
    importLegacyTxNotesFromLs(...a),
}));
vi.mock("./txNotesOutboxRecovery.js", () => ({
  requeueTxNotesRejectedByOldServer: (...a: unknown[]) =>
    requeueTxNotesRejectedByOldServer(...a),
}));

import type { SqliteMigrationClient } from "@sergeant/db-schema/migrate/sqlite";
import { runTxNotesBootSteps } from "./txNotesBoot";

const client = {} as SqliteMigrationClient;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("runTxNotesBootSteps", () => {
  it("спершу перелиття LS, потім перепостановка відхилених старим сервером", async () => {
    await runTxNotesBootSteps(client, "u1", "2026-10-10T10:00:00.000Z");
    expect(calls).toEqual(["import", "requeue"]);
    expect(importLegacyTxNotesFromLs).toHaveBeenCalledWith(
      client,
      "u1",
      "2026-10-10T10:00:00.000Z",
    );
    expect(requeueTxNotesRejectedByOldServer).toHaveBeenCalledWith(
      client,
      "u1",
    );
  });

  it("збій перелиття не блокує перепостановку й не кидає", async () => {
    importLegacyTxNotesFromLs.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      runTxNotesBootSteps(client, "u1", "2026-10-10T10:00:00.000Z"),
    ).resolves.toBeUndefined();
    expect(requeueTxNotesRejectedByOldServer).toHaveBeenCalledTimes(1);
  });

  it("збій перепостановки не кидає", async () => {
    requeueTxNotesRejectedByOldServer.mockRejectedValueOnce(
      new Error("outbox locked"),
    );
    await expect(
      runTxNotesBootSteps(client, "u1", "2026-10-10T10:00:00.000Z"),
    ).resolves.toBeUndefined();
  });
});
