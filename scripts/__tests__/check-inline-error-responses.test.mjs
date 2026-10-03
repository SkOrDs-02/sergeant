// scripts/__tests__/check-inline-error-responses.test.mjs
//
// Тести бюджетного гейта інлайнових error-відповідей.
//
// Стережуть не «скрипт запускається», а два рішення, на яких він тримається:
// бюджет НЕ можна тихо підняти, і список винятків не можна поповнити мовчки.
// Обидва — саме ті місця, через які гейт перестав би щось означати.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const SCRIPT = join(ROOT, "scripts/check-inline-error-responses.mjs");
const BUDGET = join(ROOT, ".tech-debt/inline-error-responses-budget.json");

function run(args = []) {
  try {
    return {
      code: 0,
      out: execFileSync("node", [SCRIPT, ...args], {
        cwd: ROOT,
        encoding: "utf8",
      }),
    };
  } catch (e) {
    return { code: e.status ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

test("на поточному дереві гейт зелений", () => {
  const { code, out } = run(["--json"]);
  const d = JSON.parse(out);
  assert.equal(code, 0);
  assert.deepEqual(d.worse, []);
  assert.ok(d.sites > 0, "сканер не знайшов жодного місця — зламано?");
});

test("baseline описує саме те, що бачить сканер", () => {
  const budget = JSON.parse(readFileSync(BUDGET, "utf8"));
  const d = JSON.parse(run(["--json"]).out);
  assert.equal(budget.code, d.actual.code);
  assert.equal(budget.requestId, d.actual.requestId);
  // `code` мусить бути строго меншим за `requestId`: перше — підмножина
  // другого за змістом (місце з кодом майже завжди без requestId). Якщо
  // рівність — сканер, найпевніше, перестав розрізняти поля.
  assert.ok(budget.code < budget.requestId);
});

test("нова інлайнова відповідь без code валить гейт", () => {
  // Найдешевший доказ, що сканер справді щось ловить: дописуємо справжнє
  // місце у справжній серверний файл і прибираємо назад.
  const victim = join(ROOT, "apps/server/src/http/health.ts");
  const orig = readFileSync(victim, "utf8");
  try {
    writeFileSync(
      victim,
      orig +
        `\nexport function __probe(res) {\n  res.status(418).json({ error: "probe" });\n}\n`,
    );
    const { code, out } = run();
    assert.equal(code, 1, "гейт не помітив нової інлайнової відповіді");
    assert.match(out, /Борг зріс/);
    assert.match(out, /http\/health\.ts/);
  } finally {
    writeFileSync(victim, orig);
  }
  assert.equal(run().code, 0, "стан не відновлено");
});

test("--update відмовляється піднімати бюджет", () => {
  const orig = readFileSync(BUDGET, "utf8");
  try {
    const b = JSON.parse(orig);
    writeFileSync(
      BUDGET,
      JSON.stringify({ ...b, code: b.code - 1 }, null, 2) + "\n",
    );
    const { code, out } = run(["--update"]);
    assert.equal(code, 1);
    assert.match(out, /лише коли борг зменшився/);
    // Файл лишився недоторканим.
    assert.equal(JSON.parse(readFileSync(BUDGET, "utf8")).code, b.code - 1);
  } finally {
    writeFileSync(BUDGET, orig);
  }
});

test("EXEMPT_FILES — кожен запис із причиною і на живий файл", () => {
  // Виняток можна додати, але свідомо: без причини список стає тихим
  // способом обійти гейт замість того, щоб полагодити контракт.
  const src = readFileSync(SCRIPT, "utf8");
  const block = src.slice(
    src.indexOf("const EXEMPT_FILES"),
    src.indexOf("/** `res.status("),
  );
  const entries = [...block.matchAll(/\[\s*"([^"]+)",\s*"([^"]+)",?\s*\]/g)];
  assert.equal(entries.length, 3, "склад винятків змінився — перечитай шапку");
  for (const [, file, reason] of entries) {
    assert.ok(
      existsSync(join(ROOT, "apps/server/src", file)),
      `виняток на неіснуючий ${file}`,
    );
    assert.ok(reason.length > 25, `${file}: причина надто коротка`);
  }
});
