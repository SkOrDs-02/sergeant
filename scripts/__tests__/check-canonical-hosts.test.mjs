// scripts/__tests__/check-canonical-hosts.test.mjs
//
// Тести на сам гейт канонічних хостів. Перевіряють не «скрипт існує», а ті
// властивості, втрата яких зробила б його мовчазним або брехливим:
//
//   1. break-test на РЕАЛЬНОМУ дефекті — списки станом до 2026-09-17
//      ловляться, і саме тими двома хостами;
//   2. happy path — коли прод-походження є в канонічних, порушень немає;
//   3. напрямок перевірки однобічний: зайвий канонічний хост (лендинг) НЕ
//      вимагає запису в `PROD_ORIGINS`;
//   4. origin нормалізується до host — інакше `https://x` ніколи не збігся б
//      із `x` і гейт червонів би завжди, тобто був би вимкненим;
//   5. коментарі всередині списку не читаються як записи — `cors.ts` тримає
//      у докстрінгу зразок vercel-домена, і гейт, який ловить власний
//      коментар, змушував би вносити в код те, чого в ньому немає.
//
// Run with:  node --test scripts/__tests__/check-canonical-hosts.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findMissingHosts,
  parseArrayLiterals,
  toHost,
} from "../check-canonical-hosts.mjs";

test("break-test: справжній стан до 2026-09-17 ловиться", () => {
  // Рівно ті списки, з якими 94% подій веба їхали як `preview`.
  const prodOrigins = [
    "https://sergeant.vercel.app",
    "https://sergeant.2dmanager.com.ua",
    "https://app.sergeant.com.ua",
  ];
  const canonicalHosts = [
    "sergeant.vercel.app",
    "beta-tau-gilt.vercel.app",
    "sergeant-landing.vercel.app",
  ];
  assert.deepEqual(findMissingHosts(prodOrigins, canonicalHosts), [
    "sergeant.2dmanager.com.ua",
    "app.sergeant.com.ua",
  ]);
});

test("happy path: усі прод-походження канонічні", () => {
  assert.deepEqual(
    findMissingHosts(
      ["https://app.sergeant.com.ua", "https://sergeant.vercel.app"],
      [
        "app.sergeant.com.ua",
        "sergeant.vercel.app",
        "sergeant-landing.vercel.app",
      ],
    ),
    [],
  );
});

test("зайвий канонічний хост не вимагає запису в PROD_ORIGINS", () => {
  // Лендинг до API не ходить, тож credentialed CORS йому не потрібен — але
  // телеметрію з нього ми хочемо бачити як production.
  assert.deepEqual(
    findMissingHosts(
      ["https://app.sergeant.com.ua"],
      ["app.sergeant.com.ua", "sergeant-landing.vercel.app"],
    ),
    [],
  );
});

test("origin нормалізується до host, регістр не має значення", () => {
  assert.equal(toHost("https://App.Sergeant.COM.ua"), "app.sergeant.com.ua");
  assert.equal(toHost("app.sergeant.com.ua"), "app.sergeant.com.ua");
  assert.deepEqual(
    findMissingHosts(["https://APP.sergeant.com.ua"], ["app.sergeant.com.ua"]),
    [],
  );
});

test("коментар усередині списку не рахується записом", () => {
  const src = `
const PROD_ORIGINS = [
  // напр.: "https://sergeant-git-branch-team.vercel.app"
  "https://app.sergeant.com.ua",
];`;
  assert.deepEqual(parseArrayLiterals(src, "PROD_ORIGINS"), [
    "https://app.sergeant.com.ua",
  ]);
});

test("відсутній список повертає null, а не порожній масив", () => {
  // Порожній масив тут читався б як «порушень немає» — тобто зламаний гейт
  // рапортував би зелене. Різниця має бути помітною на виклику.
  assert.equal(parseArrayLiterals("const OTHER = [];", "PROD_ORIGINS"), null);
});

test("гейт бачить фактичні файли репо і вони в синхроні", async () => {
  const { readFileSync } = await import("node:fs");
  const prod = parseArrayLiterals(
    readFileSync("apps/server/src/http/cors.ts", "utf8"),
    "PROD_ORIGINS",
  );
  const canonical = parseArrayLiterals(
    readFileSync(
      "apps/web/src/core/observability/deployEnvironment.ts",
      "utf8",
    ),
    "DEFAULT_CANONICAL_HOSTS",
  );
  assert.ok(prod && prod.length > 0, "PROD_ORIGINS не розпарсився");
  assert.ok(
    canonical && canonical.length > 0,
    "DEFAULT_CANONICAL_HOSTS не розпарсився",
  );
  assert.deepEqual(findMissingHosts(prod, canonical), []);
});
