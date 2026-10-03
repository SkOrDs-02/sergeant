import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetActiveSqliteVfsForTests,
  noteActiveSqliteVfs,
} from "../db/storageBackendState";
import { installMemoryLocalStorage } from "./__tests__/memoryLocalStorage";
import {
  ackDualWrite,
  journalDualWrite,
  pendingDualWrites,
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

  it("позначає запис, застосований у памʼяті, щоб реплей не трактував його як повну заміну (data-10)", () => {
    noteActiveSqliteVfs("memory");
    const id = journalDualWrite("nutrition", "u1", { n: 1 });
    expect(pendingDualWrites("nutrition", "u1")[0]?.appliedInMemory).toBe(
      undefined,
    );
    ackDualWrite(id);
    expect(pendingDualWrites("nutrition", "u1")[0]?.appliedInMemory).toBe(true);
  });

  it("запис, застосований на персистентній базі, прапора не отримує", () => {
    noteActiveSqliteVfs("opfs-sahpool");
    const id = journalDualWrite("nutrition", "u1", { n: 1 });
    ackDualWrite(id);
    expect(pendingDualWrites("nutrition", "u1")).toEqual([]);
  });
});
