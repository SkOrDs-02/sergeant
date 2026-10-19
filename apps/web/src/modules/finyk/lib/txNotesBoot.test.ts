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
import { runTxNotesImportStep, runTxNotesRequeueStep } from "./txNotesBoot";

const client = {} as SqliteMigrationClient;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
});

describe("runTxNotesImportStep", () => {
  it("викликає перелиття LS із клієнтом, користувачем і clientTs", async () => {
    await runTxNotesImportStep(client, "u1", "2026-10-10T10:00:00.000Z");
    expect(calls).toEqual(["import"]);
    expect(importLegacyTxNotesFromLs).toHaveBeenCalledWith(
      client,
      "u1",
      "2026-10-10T10:00:00.000Z",
    );
    expect(requeueTxNotesRejectedByOldServer).not.toHaveBeenCalled();
  });

  it("збій перелиття не кидає", async () => {
    importLegacyTxNotesFromLs.mockRejectedValueOnce(new Error("disk full"));
    await expect(
      runTxNotesImportStep(client, "u1", "2026-10-10T10:00:00.000Z"),
    ).resolves.toBeUndefined();
  });
});

describe("runTxNotesRequeueStep", () => {
  it("викликає перепостановку відхилених старим сервером", async () => {
    await runTxNotesRequeueStep(client, "u1");
    expect(calls).toEqual(["requeue"]);
    expect(requeueTxNotesRejectedByOldServer).toHaveBeenCalledWith(
      client,
      "u1",
    );
    expect(importLegacyTxNotesFromLs).not.toHaveBeenCalled();
  });

  it("збій перепостановки не кидає", async () => {
    requeueTxNotesRejectedByOldServer.mockRejectedValueOnce(
      new Error("outbox locked"),
    );
    await expect(runTxNotesRequeueStep(client, "u1")).resolves.toBeUndefined();
  });
});
