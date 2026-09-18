// scripts/__tests__/check-vite-flag-registry.test.mjs
//
// Тести гейта реєстру `VITE_*`.
//
// Головне, що вони стережуть, — це НЕ «скрипт запускається», а два рішення,
// на яких він побудований і які легко відкотити назад необачним рефактором:
//
//   1. Фантомні імена не потрапляють у вимогу. На цьому дереві їх два
//      (`VITE_API_URL` — імʼя лише в коментарі тесту, такої змінної не існує;
//      `VITE_VOICE_PROVIDER` — назва є, читання немає). Відсіює їх
//      `stripComments()` + пропуск `*.test.*`, а НЕ форма патернів: зламом
//      перевірено, що підміна патернів на голе `/(VITE_[A-Z0-9_]+)/g` лишає
//      гейт зеленим. Тому тут два різні тести: один на фантоми, другий —
//      структурний, на те, що патерни лишились читаннєвими.
//   2. Обидва канони рівноправні: тумблер може жити у feature-flags.md,
//      значення — в env-vars.md, і гейт не має наполягати на одному.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const SCRIPT = join(ROOT, "scripts/check-vite-flag-registry.mjs");

function run() {
  const out = execFileSync("node", [SCRIPT, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(out);
}

test("на поточному дереві всі прочитані змінні описані", () => {
  const { read, missing } = run();
  assert.equal(
    missing.length,
    0,
    `не описані: ${missing.map((m) => m.name).join(", ")}`,
  );
  // Нижня межа, щоб зламаний сканер (0 знайдених) не читався як «усе добре».
  assert.ok(read >= 15, `гейт побачив лише ${read} змінних — сканер зламано?`);
});

test("сканер не рахує імена з коментарів і тестів", () => {
  const { missing } = run();
  const names = new Set(missing.map((m) => m.name));
  // `VITE_API_URL` існує ЛИШЕ як застаріле імʼя в коментарі; справжнє —
  // `VITE_API_BASE_URL`. Якщо воно тут — сканер перейшов на текстовий скан.
  assert.ok(!names.has("VITE_API_URL"));
  // `VITE_VOICE_PROVIDER` згадується в коментарі й у `vi.stubEnv` тесту, але
  // `resolveConfiguredProvider()` повертає "auto" літералом.
  assert.ok(!names.has("VITE_VOICE_PROVIDER"));
});

test("гейт приймає обидва канони як рівноправні", () => {
  const flags = readFileSync(
    join(ROOT, "docs/engineering/architecture/feature-flags.md"),
    "utf8",
  );
  const env = readFileSync(
    join(ROOT, "docs/engineering/integrations/env-vars.md"),
    "utf8",
  );
  // Тумблер описаний у реєстрі прапорців…
  assert.ok(flags.includes("VITE_PRIVAT_ENABLED"));
  assert.ok(!env.includes("VITE_PRIVAT_ENABLED"));
  // …а значення — у env-vars, і гейт зелений в обох випадках.
  assert.ok(env.includes("VITE_BUILD_OUT_DIR"));
  assert.ok(!flags.includes("VITE_BUILD_OUT_DIR"));
  assert.equal(run().missing.length, 0);
});

test("патерни лишаються читаннєвими, а не текстовими", () => {
  // Структурний пін, бо поведінкою це не ловиться: голий текстовий скан на
  // поточному дереві дає той самий зелений результат (перевірено зламом).
  // Різниця виявиться лише тоді, коли хтось згадає імʼя змінної в рядковому
  // літералі чи таблиці — і гейт зажадає доку на згадку.
  const src = readFileSync(SCRIPT, "utf8");
  const block = src.slice(
    src.indexOf("const READ_PATTERNS"),
    src.indexOf("function collect"),
  );
  assert.match(block, /import\\\.meta\\\.env/);
  assert.ok(
    !/\[\s*\/\(VITE_\[A-Z0-9_\]\+\)\/g\s*\]/.test(block),
    "патерни звелись до голого текстового скану",
  );
});

test("список винятків порожній — інакше він тихо послаблює гейт", () => {
  // Виняток можна додати, але свідомо: цей тест зробить таке рішення
  // видимим у дифі замість того, щоб воно проїхало як рядок у мапі.
  const src = readFileSync(SCRIPT, "utf8");
  const block = src.slice(src.indexOf("const EXEMPT"));
  const decl = block.slice(0, block.indexOf(";") + 1);
  assert.match(decl, /new Map\(\[\s*\]\)/);
});
