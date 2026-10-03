// scripts/ci/__tests__/check-vi-mock-cap.test.mjs
//
// Unit-тести чистих helper-ів vi.mock cap-гейта (node --test, без фікстур на
// диску — уся файлова робота живе лише в main()). Запускається разом із
// самим гейтом у `pnpm lint:vi-mock-cap`, щоб зламаний лічильник падав до
// того, як гейт почне вирішувати долю PR-а: гейт, який рахує неправильно,
// гірший за відсутній.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CAP,
  countViMocks,
  evaluateCap,
  buildBaselineFiles,
} from "../check-vi-mock-cap.mjs";

// ── countViMocks ─────────────────────────────────────────────────────────────

test("рахує звичайні виклики vi.mock", () => {
  const src = `
    import { vi } from "vitest";
    vi.mock("./a", () => ({ default: () => null }));
    vi.mock("./b");
    vi.mock('./c', () => ({}));
  `;
  assert.equal(countViMocks(src), 3);
});

test("vi.mocked поруч не рахується", () => {
  const src = `
    vi.mock("./a");
    const spy = vi.mocked(thing);
    vi.mocked(other).mockReturnValue(1);
    vi.mocked(third);
  `;
  assert.equal(countViMocks(src), 1);
});

test("vi.doMock не рахується (інший API)", () => {
  const src = `
    vi.mock("./a");
    await vi.doMock("./b", () => ({}));
  `;
  assert.equal(countViMocks(src), 1);
});

test("виклики в рядкових коментарях не рахуються", () => {
  const src = `
    vi.mock("./real");
    // vi.mock("./commented-out");
    //vi.mock("./tight");
  `;
  assert.equal(countViMocks(src), 1);
});

test("виклики в блокових коментарях не рахуються", () => {
  const src = `
    /*
     * Раніше тут було:
     * vi.mock("./old-one");
     * vi.mock("./old-two");
     */
    vi.mock("./real");
    /* vi.mock("./inline") */
  `;
  assert.equal(countViMocks(src), 1);
});

test("виклики всередині рядкових літералів не рахуються", () => {
  const src = `
    vi.mock("./real");
    const hint = "додай vi.mock(\\"./x\\") сюди";
    const other = 'vi.mock("./y")';
    const tpl = \`vi.mock("./z")\`;
  `;
  assert.equal(countViMocks(src), 1);
});

test("URL-подібний рядок із // не з'їдає решту файлу як коментар", () => {
  const src = `
    const base = "https://example.com/x";
    vi.mock("./a");
    vi.mock("./b");
  `;
  assert.equal(countViMocks(src), 2);
});

test("regex-літерал із лапками не збиває сканер", () => {
  const src = `
    const re = /["'\`]/g;
    vi.mock("./a");
    const re2 = /vi\\.mock\\(/;
    vi.mock("./b");
  `;
  assert.equal(countViMocks(src), 2);
});

test("пробіли навколо крапки й дужки враховані; devi.mock не ловиться", () => {
  const src = `
    vi . mock ("./a");
    vi.mock  ("./b");
    devi.mock("./c");
  `;
  assert.equal(countViMocks(src), 2);
});

test("файл без моків дає 0", () => {
  assert.equal(countViMocks("export const x = 1;\n"), 0);
});

// ── evaluateCap ──────────────────────────────────────────────────────────────

const baseline = {
  cap: CAP,
  files: {
    "apps/web/src/a.test.tsx": 12,
    "apps/web/src/b.test.tsx": 8,
  },
};

test("сценарій 1: файл у baseline, лічильник = записаному → PASS", () => {
  const { failures, improvements } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": 12,
    "apps/web/src/b.test.tsx": 8,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(improvements, {});
});

test("сценарій 2: файл у baseline, лічильник зменшився → PASS + improvement", () => {
  const { failures, improvements, nextFiles } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": 9,
    "apps/web/src/b.test.tsx": 8,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(improvements, { "apps/web/src/a.test.tsx": 9 });
  // Ратчет ходить лише вниз: nextFiles фіксує нове, менше число.
  assert.equal(nextFiles["apps/web/src/a.test.tsx"], 9);
});

test("сценарій 2b: падіння до cap прибирає запис із baseline (виняток зайвий)", () => {
  const { failures, nextFiles } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": CAP,
    "apps/web/src/b.test.tsx": 8,
  });
  assert.deepEqual(failures, []);
  assert.ok(!("apps/web/src/a.test.tsx" in nextFiles));
  assert.equal(nextFiles["apps/web/src/b.test.tsx"], 8);
});

test("сценарій 3: файл у baseline, лічильник виріс → FAIL", () => {
  const { failures, nextFiles } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": 13,
    "apps/web/src/b.test.tsx": 8,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /a\.test\.tsx/);
  assert.match(failures[0], /13/);
  // Навіть при зростанні baseline не піднімається — храповик односторонній.
  assert.equal(nextFiles["apps/web/src/a.test.tsx"], 12);
});

test("сценарій 4: файл поза baseline і понад cap → FAIL з підказкою про MSW", () => {
  const { failures } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": 12,
    "apps/web/src/b.test.tsx": 8,
    "apps/web/src/new.test.tsx": CAP + 1,
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /new\.test\.tsx/);
  assert.match(failures[0], /MSW/);
});

test("сценарій 5: файл поза baseline у межах cap → PASS", () => {
  const { failures } = evaluateCap(baseline, {
    "apps/web/src/a.test.tsx": 12,
    "apps/web/src/b.test.tsx": 8,
    "apps/web/src/new.test.tsx": CAP,
    "apps/web/src/clean.test.tsx": 0,
  });
  assert.deepEqual(failures, []);
});

test("протухлий запис (файлу немає) — попередження, не FAIL, і зникає з nextFiles", () => {
  const { failures, stale, nextFiles } = evaluateCap(baseline, {
    "apps/web/src/b.test.tsx": 8,
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(stale, ["apps/web/src/a.test.tsx"]);
  assert.deepEqual(nextFiles, { "apps/web/src/b.test.tsx": 8 });
});

test("порожній baseline: усе понад cap фейлить, решта проходить", () => {
  const { failures } = evaluateCap(
    { files: {} },
    {
      "apps/web/src/x.test.tsx": 6,
      "apps/web/src/y.test.tsx": 5,
    },
  );
  assert.equal(failures.length, 1);
  assert.match(failures[0], /x\.test\.tsx/);
});

// ── buildBaselineFiles ───────────────────────────────────────────────────────

test("buildBaselineFiles бере лише файли понад cap, відсортовані", () => {
  const files = buildBaselineFiles({
    "b.test.ts": 9,
    "a.test.ts": 7,
    "c.test.ts": CAP,
    "d.test.ts": 0,
  });
  assert.deepEqual(Object.keys(files), ["a.test.ts", "b.test.ts"]);
  assert.deepEqual(files, { "a.test.ts": 7, "b.test.ts": 9 });
});
