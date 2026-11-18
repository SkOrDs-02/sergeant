import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @status Active
 *
 * PR-T1, рішення власника Б (2026-11-18): `@sqlite.org/sqlite-wasm` живе
 * ЛИШЕ у воркері. До того головний потік мав власну копію (kvvfs-фолбек,
 * разове перелиття `kvvfsHandoff`, мертва гілка OPFS-SAH), і `size-limit`
 * рахував ~55 kB brotli двічі: у `vendor-sqlite` і в `sqliteWorker`.
 *
 * Тест — статичний обхід `apps/web/src`: жоден модуль, крім воркерних, не
 * має згадувати пакет ні статичним, ні динамічним імпортом, ні
 * `typeof import(...)`. Окремо: воркерні модулі не можна імпортувати з
 * головного потоку — інакше пакет прийде транзитивно, і перша перевірка
 * нічого б не побачила.
 *
 * Чому не лише граф із `main.tsx`: динамічний `import()` теж емітить чанк,
 * а `size-limit` сумує ВСІ чанки. Саме так копія і жила — лінива, але
 * порахована.
 */

const __filename = fileURLToPath(import.meta.url);
const WEB_SRC = resolve(dirname(__filename), "../../..");

/** Модулі, які збираються лише у воркерних бандлах. */
const WORKER_ONLY = new Set(
  [
    "core/db/sqliteWorker.ts",
    "core/db/sqliteWorkerHandler.ts",
    "core/db/kvvfsConvert.ts",
    "core/db/opfsProbe.worker.ts",
  ].map((p) => p.split("/").join(sep)),
);

/** Хто має право імпортувати воркерні модулі (інші воркерні модулі). */
const WORKER_ONLY_SPECIFIER =
  /(?:from\s+|import\s*\(\s*)["'][^"']*(?:sqliteWorkerHandler|kvvfsConvert|sqliteWorker|opfsProbe\.worker)(?:\.[jt]s)?["']/;

const SQLITE_WASM_REFERENCE =
  /(?:from\s+|import\s*\(\s*|import\s+)["']@sqlite\.org\/sqlite-wasm(?:\/[^"']*)?["']/;

/** `import type` стирається на білді — тип із воркерного модуля нічого не тягне. */
const TYPE_ONLY_IMPORT = /import\s+type\s[^;]*?from\s+["'][^"']+["'];?/gs;

function isTestFile(rel: string): boolean {
  return (
    /\.test\.[jt]sx?$/.test(rel) ||
    rel.split(sep).includes("__tests__") ||
    rel.split(sep)[0] === "test"
  );
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, out);
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(name)) {
      out.push(abs);
    }
  }
}

function mainThreadSources(): { rel: string; src: string }[] {
  const files: string[] = [];
  walk(WEB_SRC, files);
  return files
    .map((abs) => ({ rel: relative(WEB_SRC, abs), abs }))
    .filter(({ rel }) => !isTestFile(rel) && !WORKER_ONLY.has(rel))
    .map(({ rel, abs }) => ({ rel, src: readFileSync(abs, "utf8") }));
}

describe("sqlite-wasm не живе на головному потоці (PR-T1)", () => {
  const sources = mainThreadSources();

  it("обхід бачить сам sqlite.ts — інакше перевірка порожня", () => {
    expect(
      sources.some(({ rel }) => rel === join("core", "db", "sqlite.ts")),
    ).toBe(true);
  });

  it("жоден модуль головного потоку не імпортує @sqlite.org/sqlite-wasm", () => {
    const offenders = sources
      .filter(({ src }) => SQLITE_WASM_REFERENCE.test(src))
      .map(({ rel }) => rel);
    expect(
      offenders,
      "sqlite-wasm на головному потоці рахується в size-limit удруге " +
        "(поверх воркера). Роби роботу у `sqliteWorkerHandler.ts`.",
    ).toEqual([]);
  });

  it("жоден модуль головного потоку не імпортує воркерні модулі", () => {
    const offenders = sources
      .filter(({ src }) =>
        WORKER_ONLY_SPECIFIER.test(src.replace(TYPE_ONLY_IMPORT, "")),
      )
      .map(({ rel }) => rel);
    expect(
      offenders,
      "Воркерні модулі тягнуть sqlite-wasm транзитивно. З головного потоку " +
        'воркер піднімається лише як `new Worker(new URL("./sqliteWorker.ts", …))`.',
    ).toEqual([]);
  });
});
