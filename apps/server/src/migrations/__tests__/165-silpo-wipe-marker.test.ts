// Міграція 165 - `silpo_wipe_marker` (аудит 2026-10-01, data-47).
//
// Статичний лейн: маркер wipe окремою таблицею, що не залежить від
// `silpo_connection` (disconnect видаляє той рядок), з каскадом від "user"
// (GDPR-видалення акаунта прибирає й маркер) і бекфілом з колонки 159.
// Живий лейн (Testcontainers) локально без Docker недоступний.

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

describe("165 - форма (статичний лейн)", () => {
  it("маркер у власній таблиці з PK user_id і каскадом від user, не на silpo_connection", async () => {
    const up = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "165_silpo_wipe_marker.sql"),
        "utf8",
      ),
    );
    expect(up).toMatch(/CREATE TABLE IF NOT EXISTS silpo_wipe_marker/);
    expect(up).toMatch(
      /user_id\s+TEXT PRIMARY KEY REFERENCES "user"\(id\) ON DELETE CASCADE/,
    );
    expect(up).toMatch(/wiped_at\s+TIMESTAMPTZ NOT NULL/);
    expect(up).not.toMatch(/REFERENCES silpo_connection/);
    expect(up).toMatch(
      /FROM silpo_connection[\s\S]*receipts_wiped_at IS NOT NULL/,
    );
    expect(up).not.toMatch(/DROP\s/i);
  });

  it("down прибирає рівно свою таблицю", async () => {
    const down = statementsOnly(
      await fs.readFile(
        path.join(MIGRATIONS_DIR, "165_silpo_wipe_marker.down.sql"),
        "utf8",
      ),
    );
    expect(down.trim()).toBe("DROP TABLE IF EXISTS silpo_wipe_marker;");
  });
});
