import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMigrationFiles } from "../migrate/files.js";

/**
 * Tests for the Node-only `loadMigrationFiles` helper. Browser/mobile
 * bundles do not import this — the runner itself is fs-free.
 */

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sergeant-migrations-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("loadMigrationFiles", () => {
  it("loads NNN_*.sql files in lexicographic order", async () => {
    const dir = await mkSubdir("ordered");
    await fs.writeFile(path.join(dir, "002_b.sql"), "SELECT 2;");
    await fs.writeFile(path.join(dir, "001_a.sql"), "SELECT 1;");
    await fs.writeFile(path.join(dir, "010_j.sql"), "SELECT 10;");
    const files = await loadMigrationFiles(dir);
    expect(files.map((f) => f.name)).toEqual([
      "001_a.sql",
      "002_b.sql",
      "010_j.sql",
    ]);
    expect(files.map((f) => f.sql)).toEqual([
      "SELECT 1;",
      "SELECT 2;",
      "SELECT 10;",
    ]);
  });

  it("excludes .down.sql companions", async () => {
    const dir = await mkSubdir("downs");
    await fs.writeFile(path.join(dir, "001_a.sql"), "SELECT 1;");
    await fs.writeFile(path.join(dir, "001_a.down.sql"), "DROP TABLE a;");
    const files = await loadMigrationFiles(dir);
    expect(files.map((f) => f.name)).toEqual(["001_a.sql"]);
  });

  it("ignores non-SQL files and files that don't match the pattern", async () => {
    const dir = await mkSubdir("mixed");
    await fs.writeFile(path.join(dir, "001_a.sql"), "SELECT 1;");
    await fs.writeFile(path.join(dir, "README.md"), "# notes");
    await fs.writeFile(path.join(dir, "no-prefix.sql"), "SELECT 2;");
    await fs.writeFile(path.join(dir, "abc_word.sql"), "SELECT 3;");
    const files = await loadMigrationFiles(dir);
    expect(files.map((f) => f.name)).toEqual(["001_a.sql"]);
  });

  it("returns an empty list for an empty directory", async () => {
    const dir = await mkSubdir("empty");
    const files = await loadMigrationFiles(dir);
    expect(files).toEqual([]);
  });

  it("rejects when the directory does not exist", async () => {
    await expect(
      loadMigrationFiles(path.join(tmpDir, "does-not-exist")),
    ).rejects.toThrow();
  });
});

async function mkSubdir(name: string): Promise<string> {
  const dir = path.join(tmpDir, name);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
