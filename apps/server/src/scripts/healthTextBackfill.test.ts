/** @vitest-environment node */
import { describe, it, expect } from "vitest";
import {
  parseCliArgs,
  planNote,
  runBackfill,
  formatReport,
  type Queryable,
} from "./healthTextBackfill.js";
import { decryptString, isEncrypted } from "../auth/tokenCrypto.js";
import type { KeyRing } from "../lib/keyRing.js";

/**
 * Unit-тести без Postgres: `Queryable` — in-memory дублер, що відтворює
 * семантику двох SELECT/UPDATE зі скрипта (фільтр plaintext, keyset по id,
 * оптимістичний замок). Самі SQL-рядки цим не перевіряються, їх звіряли
 * вручну на тимчасовому Postgres (див. спеку).
 */

function makeRing(): KeyRing {
  const key = Buffer.alloc(32, 7);
  return {
    current: { version: 1, key },
    byVersion: new Map([[1, key]]),
    versions: [1],
  };
}

interface FakeDb extends Queryable {
  injuries: Map<string, string>;
  opLog: Map<string, { table: string; row: Record<string, unknown> }>;
  writes: number;
}

function makeDb(): FakeDb {
  const injuries = new Map<string, string>([
    ["inj_a", "plain A"],
    ["inj_b", "plain B"],
    ["inj_c", ""],
    ["inj_d", "enc:v2:k1:aa:bb:cc"],
    ["inj_e", "plain E"],
  ]);
  const opLog = new Map<
    string,
    { table: string; row: Record<string, unknown> }
  >([
    ["1", { table: "fizruk_injuries", row: { id: "inj_a", note: "plain A" } }],
    [
      "2",
      {
        table: "fizruk_injuries",
        row: { id: "inj_d", note: "enc:v2:k1:aa:bb:cc" },
      },
    ],
    ["3", { table: "fizruk_injuries", row: { id: "inj_x" } }],
    ["4", { table: "routine_entries", row: { note: "not health" } }],
    ["5", { table: "fizruk_injuries", row: { id: "inj_b", note: "plain B" } }],
  ]);
  const db: FakeDb = {
    injuries,
    opLog,
    writes: 0,
    async query(sql, params = []) {
      const isSelect = sql.trimStart().startsWith("SELECT");
      const isInj =
        sql.includes("fizruk_injuries SET") ||
        sql.includes("FROM fizruk_injuries");
      if (isSelect && isInj) {
        const cursor = params[0] as string | null;
        const limit = params[1] as number;
        const rows = [...injuries.entries()]
          .filter(([, note]) => note !== "" && !isEncrypted(note))
          .filter(([id]) => cursor === null || id > cursor)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .slice(0, limit)
          .map(([id, value]) => ({ id, value }));
        return { rows, rowCount: rows.length };
      }
      if (isSelect) {
        const cursor = params[0] as string | null;
        const limit = params[1] as number;
        const rows = [...opLog.entries()]
          .filter(([, v]) => v.table === "fizruk_injuries")
          .filter(
            ([, v]) =>
              typeof v.row["note"] === "string" &&
              v.row["note"] !== "" &&
              !isEncrypted(v.row["note"] as string),
          )
          .filter(([id]) => cursor === null || Number(id) > Number(cursor))
          .sort(([a], [b]) => Number(a) - Number(b))
          .slice(0, limit)
          .map(([id, v]) => ({ id, value: v.row["note"] }));
        return { rows, rowCount: rows.length };
      }
      const [id, next, prev] = params as [string, string, string];
      if (sql.includes("UPDATE fizruk_injuries")) {
        if (injuries.get(id) !== prev) return { rows: [], rowCount: 0 };
        injuries.set(id, next);
        db.writes += 1;
        return { rows: [], rowCount: 1 };
      }
      const entry = opLog.get(id);
      if (!entry || entry.row["note"] !== prev)
        return { rows: [], rowCount: 0 };
      entry.row = { ...entry.row, note: next };
      db.writes += 1;
      return { rows: [], rowCount: 1 };
    },
  };
  return db;
}

describe("parseCliArgs", () => {
  it("dry-run за замовчуванням", () => {
    expect(parseCliArgs([]).parsed?.execute).toBe(false);
  });
  it("--execute вмикає запис, --execute + --dry-run — помилка", () => {
    expect(parseCliArgs(["--execute"]).parsed?.execute).toBe(true);
    expect(parseCliArgs(["--execute", "--dry-run"]).error).toBeDefined();
  });

  it("приймає роздільник `--`, який передає `pnpm <script> -- --execute`", () => {
    expect(parseCliArgs(["--", "--execute"]).parsed?.execute).toBe(true);
  });

  it("невідомий прапорець дає error, а не виняток", () => {
    expect(parseCliArgs(["--nope"]).error).toBeDefined();
  });
  it("--batch-size валідується", () => {
    expect(parseCliArgs(["--batch-size=0"]).error).toBeDefined();
    expect(parseCliArgs(["--batch-size=1001"]).error).toBeDefined();
    expect(parseCliArgs(["--batch-size=5"]).parsed?.batchSize).toBe(5);
  });
});

describe("planNote", () => {
  const ring = makeRing();
  it("пропускає порожнє, не-рядок і вже зашифроване", () => {
    expect(planNote("", ring)).toBeNull();
    expect(planNote(null, ring)).toBeNull();
    expect(planNote("enc:v2:k1:a:b:c", ring)).toBeNull();
  });
  it("plaintext -> шифротекст, що розшифровується назад", () => {
    const out = planNote("болить коліно", ring);
    expect(out).not.toBeNull();
    expect(isEncrypted(out!)).toBe(true);
    expect(out).not.toContain("коліно");
    expect(decryptString(out!, ring)).toBe("болить коліно");
  });
});

describe("runBackfill", () => {
  const ring = makeRing();

  it("--execute шифрує plaintext у fizruk_injuries і sync_op_log", async () => {
    const db = makeDb();
    const report = await runBackfill(db, ring, { execute: true, batchSize: 2 });

    expect(db.injuries.get("inj_a")).not.toBe("plain A");
    expect(isEncrypted(db.injuries.get("inj_a"))).toBe(true);
    expect(decryptString(db.injuries.get("inj_b")!, ring)).toBe("plain B");
    expect(isEncrypted(db.injuries.get("inj_e"))).toBe(true);
    expect(db.injuries.get("inj_c")).toBe("");
    expect(db.injuries.get("inj_d")).toBe("enc:v2:k1:aa:bb:cc");

    expect(isEncrypted(db.opLog.get("1")!.row["note"] as string)).toBe(true);
    expect(db.opLog.get("1")!.row["id"]).toBe("inj_a");
    expect(db.opLog.get("2")!.row["note"]).toBe("enc:v2:k1:aa:bb:cc");
    expect(db.opLog.get("3")!.row).toEqual({ id: "inj_x" });
    expect(db.opLog.get("4")!.row["note"]).toBe("not health");
    expect(decryptString(db.opLog.get("5")!.row["note"] as string, ring)).toBe(
      "plain B",
    );

    expect(report.injuries).toMatchObject({
      needsEncrypt: 3,
      updated: 3,
      failed: 0,
    });
    expect(report.opLog).toMatchObject({
      needsEncrypt: 2,
      updated: 2,
      failed: 0,
    });
  });

  it("повторний прогін нічого не змінює (ідемпотентність)", async () => {
    const db = makeDb();
    await runBackfill(db, ring, { execute: true, batchSize: 200 });
    const injuriesAfterFirst = new Map(db.injuries);
    const writesAfterFirst = db.writes;

    const second = await runBackfill(db, ring, {
      execute: true,
      batchSize: 200,
    });
    expect(db.writes).toBe(writesAfterFirst);
    expect(db.injuries).toEqual(injuriesAfterFirst);
    expect(second.injuries.needsEncrypt).toBe(0);
    expect(second.opLog.needsEncrypt).toBe(0);
    expect(second.injuries.updated + second.opLog.updated).toBe(0);
  });

  it("dry-run нічого не пише, але рахує", async () => {
    const db = makeDb();
    const report = await runBackfill(db, ring, {
      execute: false,
      batchSize: 200,
    });
    expect(db.writes).toBe(0);
    expect(db.injuries.get("inj_a")).toBe("plain A");
    expect(db.opLog.get("1")!.row["note"]).toBe("plain A");
    expect(report.mode).toBe("dry-run");
    expect(report.injuries.needsEncrypt).toBe(3);
    expect(report.opLog.needsEncrypt).toBe(2);
    expect(report.injuries.updated).toBe(0);
  });

  it("паралельна зміна рядка: замок не затирає, лічиться як skipped-concurrent", async () => {
    const db = makeDb();
    const orig = db.query.bind(db);
    let raced = false;
    db.query = async (sql, params) => {
      if (!raced && sql.includes("UPDATE fizruk_injuries")) {
        raced = true;
        db.injuries.set("inj_a", "user edited meanwhile");
      }
      return orig(sql, params);
    };
    const report = await runBackfill(db, ring, {
      execute: true,
      batchSize: 200,
    });
    expect(db.injuries.get("inj_a")).toBe("user edited meanwhile");
    expect(report.injuries.skippedConcurrent).toBe(1);
    expect(report.injuries.failed).toBe(0);
  });

  it("помилка UPDATE не валить прогін і не пише вміст у вивід", async () => {
    const db = makeDb();
    const orig = db.query.bind(db);
    db.query = async (sql, params) => {
      if (sql.includes("UPDATE fizruk_injuries") && params?.[0] === "inj_a") {
        throw new Error("boom plain A");
      }
      return orig(sql, params);
    };
    const lines: string[] = [];
    const report = await runBackfill(
      db,
      ring,
      { execute: true, batchSize: 200 },
      (l) => lines.push(l),
    );
    expect(report.injuries.failed).toBe(1);
    expect(report.injuries.updated).toBe(2);
    expect(lines.join("\n")).not.toContain("plain");
  });

  it("звіт і лог не містять вмісту нотаток", async () => {
    const db = makeDb();
    const lines: string[] = [];
    const report = await runBackfill(
      db,
      ring,
      { execute: true, batchSize: 1 },
      (l) => lines.push(l),
    );
    const text = `${lines.join("\n")}\n${formatReport(report)}`;
    expect(text).not.toContain("plain");
    expect(text).not.toContain("enc:");
  });
});
