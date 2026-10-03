import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
} from "../db/storageBackendState";
import { installMemoryLocalStorage } from "./__tests__/memoryLocalStorage";
import {
  ackDualWrite,
  DUAL_WRITE_QUARANTINE_KEY,
  isDualWriteOutcomeClean,
  journalDualWrite,
  MAX_DUAL_WRITE_FAILED_ATTEMPTS,
  pendingDualWrites,
  recordDualWriteFailure,
  settleDualWriteEntry,
} from "./dualWriteJournal";

describe("ackDualWrite", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetActiveSqliteVfsForTests();
  });
  afterEach(() => __resetActiveSqliteVfsForTests());

  it("знімає запис, коли база персистентна", () => {
    noteActiveSqliteVfs("opfs-sahpool");
    const id = journalDualWrite("nutrition", "u1", { n: 1 });
    ackDualWrite(id);
    expect(pendingDualWrites("nutrition", "u1")).toEqual([]);
  });

  it("лишає запис у журналі, коли база відкрита в памʼяті", () => {
    noteActiveSqliteVfs("memory");
    const id = journalDualWrite("routine", "u1", { n: 1 });
    ackDualWrite(id);
    expect(pendingDualWrites("routine", "u1")).toHaveLength(1);
  });
});

describe("settleDualWriteEntry (data-05)", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetActiveSqliteVfsForTests();
    noteActiveSqliteVfs("opfs-sahpool");
  });
  afterEach(() => __resetActiveSqliteVfsForTests());

  const settled = () => Promise.resolve(true);
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("знімає запис, коли applied і errored === 0", async () => {
    const id = journalDualWrite("finyk", "u1", { n: 1 });
    settleDualWriteEntry(
      "finyk",
      id,
      { status: "applied", result: { errored: 0 } },
      settled,
    );
    await flush();
    expect(pendingDualWrites("finyk", "u1")).toEqual([]);
  });

  it("НЕ знімає запис, коли applied, але errored > 0, і рахує спробу", async () => {
    const id = journalDualWrite("finyk", "u1", { n: 1 });
    const outboxSettled = vi.fn(settled);
    settleDualWriteEntry(
      "finyk",
      id,
      { status: "applied", result: { errored: 2 } },
      outboxSettled,
    );
    await flush();
    expect(outboxSettled).not.toHaveBeenCalled();
    const [entry] = pendingDualWrites("finyk", "u1");
    expect(entry?.attempts).toBe(1);
  });

  it("лишає запис без лічильника, коли skipped (SQLite недоступна)", async () => {
    const id = journalDualWrite("finyk", "u1", { n: 1 });
    settleDualWriteEntry("finyk", id, { status: "skipped" }, settled);
    await flush();
    const [entry] = pendingDualWrites("finyk", "u1");
    expect(entry?.attempts).toBeUndefined();
  });

  it("isDualWriteOutcomeClean: applied без result вважається чистим", () => {
    expect(isDualWriteOutcomeClean({ status: "applied" })).toBe(true);
    expect(
      isDualWriteOutcomeClean({ status: "applied", result: { errored: 1 } }),
    ).toBe(false);
    expect(isDualWriteOutcomeClean({ status: "skipped" })).toBe(false);
  });
});

describe("recordDualWriteFailure: карантин отруйних записів (data-05)", () => {
  beforeEach(() => installMemoryLocalStorage());

  it("карантинить запис після N невдалих спроб і прибирає його з журналу", () => {
    const poison = journalDualWrite("routine", "u1", { bad: true });
    const healthy = journalDualWrite("routine", "u1", { ok: true });

    for (let i = 1; i < MAX_DUAL_WRITE_FAILED_ATTEMPTS; i++) {
      expect(recordDualWriteFailure("routine", poison)).toBe(false);
      expect(
        pendingDualWrites("routine", "u1").find((e) => e.id === poison)
          ?.attempts,
      ).toBe(i);
    }
    expect(recordDualWriteFailure("routine", poison)).toBe(true);

    expect(pendingDualWrites("routine", "u1").map((e) => e.id)).toEqual([
      healthy,
    ]);
    const quarantined = JSON.parse(
      localStorage.getItem(DUAL_WRITE_QUARANTINE_KEY) ?? "[]",
    ) as { id: string; attempts: number }[];
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({
      id: poison,
      attempts: MAX_DUAL_WRITE_FAILED_ATTEMPTS,
    });
  });

  it("невідомий id нічого не ламає", () => {
    expect(recordDualWriteFailure("routine", "nope")).toBe(false);
  });
});
