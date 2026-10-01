import { describe, expect, it, vi } from "vitest";

import {
  REPLICA_FRESH_WINDOW_HOURS,
  parseSqliteUtc,
  readReplicaFreshness,
  unknownReplicaFreshness,
} from "./replicaFreshness";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-08-02T12:00:00.000Z");

/** `datetime('now')` формат SQLite: `YYYY-MM-DD HH:MM:SS`, UTC, без зони. */
function sqliteStamp(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString().slice(0, 19).replace("T", " ");
}

function client(cursorAt: string | null, pending: number) {
  return {
    all: vi.fn(async (sql: string) => {
      if (sql.includes("sync_op_cursor")) {
        return cursorAt === null ? [] : [{ updated_at: cursorAt }];
      }
      return [{ n: pending }];
    }),
  } as never;
}

describe("parseSqliteUtc", () => {
  it("читає безкінцевий SQLite-штамп як UTC, а не як локальний час", () => {
    expect(parseSqliteUtc("2026-08-02 10:00:00")).toBe(
      Date.parse("2026-08-02T10:00:00.000Z"),
    );
  });

  it("не ламає рядок, що вже має зону", () => {
    expect(parseSqliteUtc("2026-08-02T10:00:00.000Z")).toBe(
      Date.parse("2026-08-02T10:00:00.000Z"),
    );
  });

  it("сміття дає null", () => {
    expect(parseSqliteUtc("не-дата")).toBeNull();
    expect(parseSqliteUtc(null)).toBeNull();
    expect(parseSqliteUtc("")).toBeNull();
  });
});

describe("readReplicaFreshness", () => {
  it("свіжий синк без черги — репліка повна", async () => {
    const out = await readReplicaFreshness(client(sqliteStamp(HOUR), 0), NOW);
    expect(out.stale).toBe(false);
    expect(out.pendingOps).toBe(0);
    expect(out.complete).toBe(true);
    expect(out.ageHours).toBeCloseTo(1, 5);
  });

  it("старий синк — сценарій E-2 (зранку телефон, увечері веб)", async () => {
    const out = await readReplicaFreshness(
      client(sqliteStamp(10 * HOUR), 0),
      NOW,
    );
    expect(out.stale).toBe(true);
    expect(out.complete).toBe(false);
  });

  it("свіжий синк, але непорожня черга — теж не повна картина", async () => {
    const out = await readReplicaFreshness(client(sqliteStamp(HOUR), 3), NOW);
    expect(out.stale).toBe(false);
    expect(out.pendingOps).toBe(3);
    // Інший бік тієї самої дірки: ці зміни ще не бачить жоден інший пристрій.
    expect(out.complete).toBe(false);
  });

  it("рівно на межі вікна репліка ще свіжа", async () => {
    const out = await readReplicaFreshness(
      client(sqliteStamp(REPLICA_FRESH_WINDOW_HOURS * HOUR), 0),
      NOW,
    );
    expect(out.stale).toBe(false);
  });

  it("синку не було — це не «все гаразд»", async () => {
    const out = await readReplicaFreshness(client(null, 0), NOW);
    expect(out.lastPullAt).toBeNull();
    expect(out.ageHours).toBeNull();
    expect(out.stale).toBe(true);
    expect(out.complete).toBe(false);
  });

  it("помилка читання дає «не знаю», а не «повна»", async () => {
    const broken = {
      all: vi.fn(async () => {
        throw new Error("no such table: sync_op_cursor");
      }),
    } as never;
    const out = await readReplicaFreshness(broken, NOW);
    expect(out.complete).toBe(false);
    expect(out.stale).toBe(true);
  });

  it("майбутній штамп не омолоджує репліку", async () => {
    const out = await readReplicaFreshness(
      client(sqliteStamp(-5 * HOUR), 0),
      NOW,
    );
    expect(out.ageHours).toBe(0);
    expect(out.stale).toBe(false);
  });
});

describe("unknownReplicaFreshness", () => {
  it("дефолт — «картина неповна», а не «повна»", () => {
    const out = unknownReplicaFreshness();
    expect(out.complete).toBe(false);
    expect(out.stale).toBe(true);
  });
});
