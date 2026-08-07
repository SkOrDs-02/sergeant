// scripts/__tests__/check-design-conventions.test.mjs
//
// Unit-тести для scripts/check-design-conventions.mjs — механічного гейта
// дизайн-конвенцій після ADR-0081. Скрипт експортує `extractStringLiterals`
// і `scanSource` саме для тестування, але тестів не мав: гейт тримає
// enforcement чотирьох конвенцій і при цьому сам був неперевіреним.
//
// Головна цінність тут — не «ловить порушення» (це видно й з прогону), а
// **anti-false-positive контракт**: скрипт свідомо сканує лише вміст
// рядкових літералів, тож JSX-текст, TS-типи і коментарі з анти-прикладами
// НЕ мають фейлити гейт. Без тесту цей контракт легко зламати першим же
// «спрощенням» токенайзера на регулярку по всьому файлу.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractStringLiterals,
  scanSource,
} from "../check-design-conventions.mjs";

const FILE = "apps/web/src/example.tsx";

const rulesOf = (source, file = FILE) =>
  scanSource(source, file).map((v) => v.rule);

// ── Позитивні випадки: кожне з чотирьох правил ловиться ─────────────────────

test("ловить raw hex у Tailwind arbitrary value", () => {
  assert.deepEqual(
    rulesOf(`export const C = () => <div className="bg-[#fff] p-2" />;`),
    ["rawHexInClassName"],
  );
});

test("ловить голий hex у className-контексті", () => {
  assert.deepEqual(rulesOf(`const cls = cn("#1c1917");`), [
    "rawHexInClassName",
  ]);
});

test("ловить `focus:` варіант, але НЕ focus-visible: / focus-within:", () => {
  assert.deepEqual(rulesOf(`const a = "focus:ring-2";`), ["focusVariant"]);
  assert.deepEqual(
    rulesOf(`const a = "focus-visible:ring-2 focus-within:bg-panel";`),
    [],
  );
});

test("focus:outline-none — канонічний виняток у парі з focus-visible:ring", () => {
  assert.deepEqual(
    rulesOf(`const a = "focus:outline-none focus-visible:ring-2";`),
    [],
  );
});

test("ловить text-2xs і довільний під-12px розмір", () => {
  assert.deepEqual(rulesOf(`const a = "text-2xs";`), ["text2xs"]);
  assert.deepEqual(rulesOf(`const a = "text-[10px]";`), ["sub12pxArbitrary"]);
  assert.deepEqual(rulesOf(`const a = "text-[11.5px]";`), ["sub12pxArbitrary"]);
});

test("12px і більше — не порушення (це і є floor, а не порушення floor-у)", () => {
  assert.deepEqual(rulesOf(`const a = "text-[12px] text-[14px]";`), []);
});

// ── Anti-false-positive контракт ────────────────────────────────────────────

test("JSX-текст не сканується — Do/Don't демо в showcase не фейлить гейт", () => {
  assert.deepEqual(
    rulesOf(`export const Demo = () => <code>focus:ring-2 text-2xs</code>;`),
    [],
  );
});

test("TS-тип із полем `focus` не сканується", () => {
  assert.deepEqual(rulesOf(`type S = { focus: Record<string, null> };`), []);
});

test("коментарі з анти-прикладами не скануються", () => {
  const source = [
    `// BAD: className="bg-[#fff] focus:ring-2 text-2xs"`,
    `/* Ще один анти-приклад: text-[10px] */`,
    `export const O = 1;`,
  ].join("\n");
  assert.deepEqual(rulesOf(source), []);
});

test("голий hex поза className-контекстом не порушення (Sentry DSN, id тощо)", () => {
  assert.deepEqual(rulesOf(`const traceId = "#a1b2c3";`), []);
});

// ── Allowlist ──────────────────────────────────────────────────────────────

test("allowlist глушить правило рівно для свого файлу", () => {
  const source = `const a = "text-2xs";`;
  assert.deepEqual(
    rulesOf(source, "apps/web/src/modules/routine/components/HabitHeatmap.tsx"),
    [],
    "allowlisted файл мовчить",
  );
  assert.deepEqual(
    rulesOf(source, "apps/web/src/modules/routine/components/Other.tsx"),
    ["text2xs"],
    "сусідній файл у тій самій теці — ні",
  );
});

// ── Репортинг ──────────────────────────────────────────────────────────────

test("номер рядка рахується всередині багаторядкового template-літерала", () => {
  const source = ["const a = `", "  p-2", "  text-2xs", "`;"].join("\n");
  const [violation] = scanSource(source, FILE);
  assert.equal(violation.rule, "text2xs");
  assert.equal(violation.line, 3);
});

test("extractStringLiterals позначає className-контекст", () => {
  const literals = extractStringLiterals(
    `const el = <div className="p-2" />; const other = "p-2";`,
  );
  assert.equal(literals.length, 2);
  assert.equal(literals[0].inClassNameContext, true);
  assert.equal(literals[1].inClassNameContext, false);
});
