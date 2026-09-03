import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { ALLOWED_MEMORY_SOURCES, RESERVED_SOURCES } from "./types.js";

/**
 * Гейт від рецидиву — ініціатива 0024 (PR-1, § Ратифіковані рішення #9:
 * "unit-тест у модулі ai-memory, без нового CI-скрипта"). `ai_memories`
 * оголошувала 10 джерел, а писали у неї 4 (замір § Перезамір
 * 2026-09-03 у `docs/90-work/initiatives/0024-ai-memory-source-
 * coverage.md`) — шість (`chat`, `finyk`, `fizruk`, `nutrition`,
 * `routine`, `journal`) не мали жодного продюсера в дереві попри
 * CHECK-констрейнт, union-тип, zod-схему й ops-документ, які обіцяли, що
 * вони пишуться.
 *
 * Правило: кожне значення `ALLOWED_MEMORY_SOURCES` має АБО реального
 * продюсера в дереві (`enqueueMemoryIngest({ source: "..." })`, прямим
 * рядковим літералом або через локальну `MemorySource`-константу в тому
 * самому файлі), АБО явний запис у `RESERVED_SOURCES` із поясненням, чому
 * продюсера немає (наприклад, legacy-джерело з рядками, що лишаються
 * тільки для читання/видалення — `cofounder`, `product`).
 *
 * Пошук — текстовий, не AST: досить, щоб зловити рецидив «додали source у
 * enum, забули підключити продюсер», не обіцяючи повної семантичної
 * перевірки викликів.
 */

const SERVER_SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const IGNORED_DIR_NAMES = new Set(["node_modules", "dist", "__snapshots__"]);

function isTestFile(fileName: string): boolean {
  return fileName.includes(".test.") || fileName.endsWith(".d.ts");
}

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, out);
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !isTestFile(entry.name)
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Повертає значення з `allowed`, для яких у дереві під `rootDir` немає ані
 * прямого продюсера (`enqueueMemoryIngest(...)` у тому самому файлі, де
 * стрічається `source: "<value>"` літералом або через локальну
 * `<value>`-константу), ані запису в `reserved`.
 */
export function findSourcesWithoutProducer(
  rootDir: string,
  allowed: readonly string[],
  reserved: readonly string[],
): string[] {
  const reservedSet = new Set(reserved);
  const candidates = allowed.filter((s) => !reservedSet.has(s));
  if (candidates.length === 0) return [];

  const files = collectTsFiles(rootDir).filter(
    // Визначення `enqueueMemoryIngest` саме по собі — не продюсер.
    (f) => !f.endsWith("ingestQueue.ts"),
  );

  const covered = new Set<string>();
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    if (!content.includes("enqueueMemoryIngest(")) continue;

    // 1. Прямий рядковий літерал: source: "digest".
    for (const match of content.matchAll(/source:\s*"([a-z]+)"/g)) {
      const value = match[1];
      if (value) covered.add(value);
    }
    // 2. Локальна MemorySource-константа: const X: MemorySource = "profile";
    //    — потім використовується як source: X десь у тому самому файлі.
    for (const match of content.matchAll(
      /:\s*MemorySource\s*=\s*"([a-z]+)"/g,
    )) {
      const value = match[1];
      if (value) covered.add(value);
    }
  }

  return candidates.filter((s) => !covered.has(s));
}

describe("ai_memories source coverage (ініціатива 0024, PR-1)", () => {
  it("кожне ALLOWED_MEMORY_SOURCES має продюсера або запис у RESERVED_SOURCES", () => {
    const uncovered = findSourcesWithoutProducer(
      SERVER_SRC_ROOT,
      ALLOWED_MEMORY_SOURCES,
      RESERVED_SOURCES,
    );
    expect(uncovered).toEqual([]);
  });

  it("RESERVED_SOURCES — підмножина ALLOWED_MEMORY_SOURCES", () => {
    for (const source of RESERVED_SOURCES) {
      expect(ALLOWED_MEMORY_SOURCES).toContain(source);
    }
  });

  describe("findSourcesWithoutProducer — синтетичне дерево", () => {
    let tmpDir: string | null = null;

    afterEach(() => {
      if (tmpDir && existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
      tmpDir = null;
    });

    it("ловить source без продюсера і без reserved-запису", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "ai-memory-sources-test-"));
      writeFileSync(
        join(tmpDir, "producer.ts"),
        `enqueueMemoryIngest({ source: "digest" });\n`,
      );

      const result = findSourcesWithoutProducer(
        tmpDir,
        ["digest", "ghost"],
        [],
      );
      expect(result).toEqual(["ghost"]);
    });

    it("не скаржиться, коли значення явно reserved", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "ai-memory-sources-test-"));
      writeFileSync(join(tmpDir, "producer.ts"), `// no producers here\n`);

      const result = findSourcesWithoutProducer(tmpDir, ["legacy"], ["legacy"]);
      expect(result).toEqual([]);
    });

    it("бачить продюсера через локальну MemorySource-константу", () => {
      tmpDir = mkdtempSync(join(tmpdir(), "ai-memory-sources-test-"));
      writeFileSync(
        join(tmpDir, "producer.ts"),
        [
          `const PROFILE_SOURCE: MemorySource = "profile";`,
          `enqueueMemoryIngest({ source: PROFILE_SOURCE });`,
        ].join("\n"),
      );

      const result = findSourcesWithoutProducer(tmpDir, ["profile"], []);
      expect(result).toEqual([]);
    });
  });
});
