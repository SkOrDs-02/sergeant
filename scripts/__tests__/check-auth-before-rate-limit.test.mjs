// scripts/__tests__/check-auth-before-rate-limit.test.mjs
//
// Тести на сам гейт порядку middleware. Перевіряють не «скрипт існує», а ті
// властивості, втрата яких зробила б його мовчазним або брехливим:
//
//   1. happy path — правильний порядок не дає порушень (обидві форми: і
//      ланцюжок `r.use`, і вбудований масив у `r.post`);
//   2. break-test — переставлені місцями сесія й лімітер ЛОВЛЯТЬСЯ;
//   3. pre-auth IP-лімітер перед сесією не вважається порушенням;
//   4. префіксне монтування `r.use(path, requireSession())` зараховується
//      маршрутам-нащадкам — інакше гейт сипав би хибними на `nutrition.ts`;
//   5. координати чесні — номер рядка вказує на реальний рядок ВИХІДНОГО
//      файлу, а не тексту зі знятими коментарями.
//
// П'ятий пункт має власну історію: перша версія скрипта вирізала коментарі
// замість гасити їх пробілами і показувала порушення `finyk.ts` на рядках 22
// і 26 — усередині докстрінга. Гейт, який бреше координатами, ганяє людину
// по хибному сліду незгірш за відсутній гейт, тому це закріплено тестом.
//
// Run with:  node --test scripts/__tests__/check-auth-before-rate-limit.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSource,
  stripComments,
} from "../check-auth-before-rate-limit.mjs";

const FILE = "apps/server/src/routes/example.ts";

test("happy path — сесія перед per-user лімітером, порушень немає", () => {
  const src = `
export function createRouter() {
  const r = Router();
  r.use("/api/x", setModule("x"));
  r.use("/api/x", rateLimitExpress({ key: "api:x:ip", limit: 600 }));
  r.use("/api/x", requireSession());
  r.use("/api/x", rateLimitExpress({ key: "api:x", limit: 120 }));
  r.post("/api/x/thing", handler);
  return r;
}`;
  assert.deepEqual(checkSource(FILE, src), []);
});

test("happy path — вбудований масив у r.post теж проходить", () => {
  const src = `
  r.post(
    "/api/y/do",
    heavyPreAuthIp,
    requireSession(),
    heavyRateLimit,
    handler,
  );
  const heavyPreAuthIp = rateLimitExpress({ key: "api:y:ip", limit: 50 });
  const heavyRateLimit = rateLimitExpress({ key: "api:y", limit: 10 });`;
  assert.deepEqual(checkSource(FILE, src), []);
});

test("break-test — лімітер ПЕРЕД сесією ловиться", () => {
  const src = `
  r.use("/api/x", rateLimitExpress({ key: "api:x", limit: 120 }));
  r.use("/api/x", requireSession());`;
  const found = checkSource(FILE, src);
  assert.equal(found.length, 2, "обидві реєстрації мають дати порушення");
  assert.match(found[1].reason, /стоїть ПЕРЕД/);
});

test("break-test — per-user лімітер без жодної сесії ловиться", () => {
  const src = `r.post("/api/x/do", rateLimitExpress({ key: "api:x" }), handler);`;
  const found = checkSource(FILE, src);
  assert.equal(found.length, 1);
  assert.match(found[0].reason, /без жодного requireSession/);
});

test("pre-auth IP-лімітер перед сесією — НЕ порушення", () => {
  const src = `
  r.use("/api/x", rateLimitExpress({ key: "api:x:ip", limit: 600 }));
  r.use("/api/x", requireSession());`;
  assert.deepEqual(checkSource(FILE, src), []);
});

test("усі три резолвери сесії зараховуються", () => {
  for (const guard of [
    "requireSession()",
    "requireSessionSoft()",
    "requireFreshSession()",
  ]) {
    const src = `r.post("/api/x/do", ${guard}, rateLimitExpress({ key: "api:x" }), handler);`;
    assert.deepEqual(
      checkSource(FILE, src),
      [],
      `${guard} має зараховуватись як резолвер сесії`,
    );
  }
});

test("префіксне монтування сесії покриває маршрути-нащадки", () => {
  const src = `
  r.use("/api/x", requireSession());
  r.post("/api/x/deep/thing", rateLimitExpress({ key: "api:x:thing" }), handler);`;
  assert.deepEqual(checkSource(FILE, src), []);
});

test("монтування на ЧУЖОМУ префіксі не зараховується", () => {
  const src = `
  r.use("/api/other", requireSession());
  r.post("/api/x/thing", rateLimitExpress({ key: "api:x" }), handler);`;
  const found = checkSource(FILE, src);
  assert.equal(found.length, 1);
  assert.match(found[0].reason, /без жодного requireSession/);
});

test("координати чесні — рядок указує у ВИХІДНИЙ файл", () => {
  const src = [
    "// рядок 1 — коментар",
    "/* рядок 2",
    "   рядок 3 — блоковий коментар,",
    "   у якому згадано requireSession() і rateLimitExpress",
    "*/",
    'r.use("/api/x", rateLimitExpress({ key: "api:x" }));',
    'r.use("/api/x", requireSession());',
  ].join("\n");
  const found = checkSource(FILE, src);
  assert.equal(found.length, 2);
  assert.equal(found[0].line, 6, "перша реєстрація — справді 6-й рядок");
  assert.equal(found[1].line, 7, "друга реєстрація — справді 7-й рядок");
});

test("stripComments зберігає довжину і переводи рядка", () => {
  const src = 'const a = 1; // хвіст\nconst b = "// не коментар";\n';
  const out = stripComments(src);
  assert.equal(out.length, src.length, "довжина має збігатись");
  assert.equal(
    out.split("\n").length,
    src.split("\n").length,
    "кількість рядків має збігатись",
  );
  assert.ok(
    out.includes('"// не коментар"'),
    "рядковий літерал не можна гасити — у ньому живуть path і key",
  );
  assert.ok(!out.includes("хвіст"), "коментар має бути погашено");
});
