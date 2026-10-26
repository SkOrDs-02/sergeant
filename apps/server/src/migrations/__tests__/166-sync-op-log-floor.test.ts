// Міграція 166 - `sync_op_log_floor` (ADR-0105 §3.1, аудит 2026-10-01 rel-06).
//
// Статичний лейн: additive-таблиця з PK user_id, каскадом від "user" і
// bigint-межею з дефолтом 0. Живий лейн - `syncV2Snapshot.integration.test.ts`.

import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "..");

function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("166 - форма (статичний лейн)", () => {
  it("нова таблиця з PK user_id, каскадом від user і floor_id bigint default 0", async () => {
    const up = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "166_sync_op_log_floor.sql"),
        "utf8",
      ),
    );
    expect(up).toMatch(/CREATE TABLE IF NOT EXISTS sync_op_log_floor/);
    expect(up).toMatch(
      /user_id\s+TEXT PRIMARY KEY REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
    expect(up).toMatch(/floor_id\s+BIGINT NOT NULL DEFAULT 0/);
    expect(up).not.toMatch(/DROP\s|ALTER\s+TABLE|INSERT\s/i);
  });

  it("down прибирає рівно свою таблицю", async () => {
    const down = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "166_sync_op_log_floor.down.sql"),
        "utf8",
      ),
    );
    expect(down.trim()).toBe("DROP TABLE IF EXISTS sync_op_log_floor;");
  });
});
