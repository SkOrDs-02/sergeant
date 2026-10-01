// scripts/ci/__tests__/check-em-dash-i18n.test.mjs
//
// Unit-тести чистого сканера гейта довгих тире (node --test, без фікстур на
// диску). Запускається разом із самим гейтом у `pnpm lint:em-dash`: гейт,
// який не бачить порушення, гірший за відсутній, бо створює хибну певність.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findEmDashes } from "../check-em-dash-i18n.mjs";

test("ловить тире в рядку копії", () => {
  const hits = findEmDashes('const a = "Немає звязку — перевір мережу.";');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
});

test("ловить тире в коментарі, якого ESLint не бачить", () => {
  const hits = findEmDashes("// Round 16 — soft-auth prompt\nconst a = 1;");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 1);
});

test("ловить тире в англійській копії", () => {
  const hits = findEmDashes('const a = "not a fact — its own summary";');
  assert.equal(hits.length, 1);
});

test("пропускає самотнє «—» як плейсхолдер порожнього значення", () => {
  assert.deepEqual(findEmDashes('const a = "—";'), []);
  assert.deepEqual(findEmDashes('const a = `${x ?? "—"} грн`;'), []);
});

test("пропускає коротке тире «–» (§9а)", () => {
  assert.deepEqual(findEmDashes('const a = "Акаунт – обліковий запис";'), []);
});

test("рахує кожне влучання окремо і не втрачає номер рядка", () => {
  const hits = findEmDashes("const a = 1;\n// перше — і друге — тире\n");
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((h) => h.line),
    [2, 2],
  );
});

test("плейсхолдер не зсуває позицію сусіднього порушення", () => {
  const [hit] = findEmDashes('const a = "—"; // текст — далі');
  assert.equal(hit.column, 'const a = "—"; // текст '.length + 1);
});
