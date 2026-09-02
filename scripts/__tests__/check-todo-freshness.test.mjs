// scripts/__tests__/check-todo-freshness.test.mjs
//
// Контракт гейта `pnpm lint:todo-freshness` на фікстурах у tmp-теці:
// прострочена дата → `expired`; тегована форма без дати → `missing-deadline`;
// згадки формату в бектиках / template-літералах і TODO у `.md` — не борг.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkFile } from "../check-todo-freshness.mjs";

// Ключове слово збираємо з частин, щоб сам цей файл не потрапив під гейт.
const T = ["TO", "DO"].join("");
const F = ["FIX", "ME"].join("");

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "todo-freshness-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name, body) {
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
}

describe("checkFile", () => {
  it("flags an expired deadline", () => {
    const p = write("a.ts", `// ${T}(old-thing): 2020-01-01 — прибрати\n`);
    const issues = checkFile(p);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "expired");
    assert.equal(issues[0].deadline, "2020-01-01");
  });

  it("accepts a future deadline", () => {
    const p = write("a.ts", `// ${T}(new-thing): 2999-01-01 — потім\n`);
    assert.deepEqual(checkFile(p), []);
  });

  it("flags the tagged form without a date as missing-deadline", () => {
    const p = write(
      "a.ts",
      `// ${T}(billing): swap useFlag for the real gate\n// ${F}(H4) later\n`,
    );
    const issues = checkFile(p);
    assert.equal(issues.length, 2);
    assert.ok(issues.every((i) => i.type === "missing-deadline"));
  });

  it("ignores mentions of the format itself (backticks, template literals)", () => {
    const p = write(
      "a.mjs",
      [
        `// \`${T}(design-lint)\` — борг на замітання`,
        `"- (none matched \`${T}(NNNN-…)\`)",`,
        "push(`" + T + "(${id}): ${date}`);",
      ].join("\n") + "\n",
    );
    assert.deepEqual(checkFile(p), []);
  });

  it("does not police tagged TODOs in markdown", () => {
    const p = write("notes.md", `${T}(later) — це документ, не код\n`);
    assert.deepEqual(checkFile(p), []);
  });

  it("keeps the keyword heuristic for bare `TODO:` lines", () => {
    const p = write(
      "a.ts",
      `// ${T}: remove after migration\n// ${T}: пояснення без боргу\n`,
    );
    const issues = checkFile(p);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].type, "missing-deadline");
  });
});
