// scripts/ci/__tests__/check-floating-promises-baseline.test.mjs
//
// Структурні тести навколо baseline-храповика `no-floating-promises`. Самого
// ESLint тут немає навмисно: type-aware прохід коштує пів хвилини навіть на
// 83 файлах, а ці перевірки мають бігати на кожному `pnpm lint`. Дорогу
// частину (чи файл ще порушує) робить сам гейт; тут — форма списку і те, що
// жоден запис не став мертвим.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { floatingPromisesBaseline } from "../../../eslint.floating-promises-baseline.js";
import { typeAwareBlocks } from "../../../eslint.type-aware.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("baseline — масив відносних шляхів під apps/", () => {
  assert.ok(Array.isArray(floatingPromisesBaseline));
  for (const entry of floatingPromisesBaseline) {
    assert.equal(typeof entry, "string");
    assert.ok(
      entry.startsWith("apps/"),
      `запис поза apps/: ${entry} — type-aware блок скоупиться на apps/**`,
    );
    assert.ok(!path.isAbsolute(entry), `абсолютний шлях у baseline: ${entry}`);
  }
});

test("baseline відсортований і без дублікатів", () => {
  const sorted = [...floatingPromisesBaseline].sort();
  assert.deepEqual(
    floatingPromisesBaseline,
    sorted,
    "baseline має бути відсортований — інакше --bump дає шумний diff",
  );
  assert.equal(
    new Set(floatingPromisesBaseline).size,
    floatingPromisesBaseline.length,
    "дублікати в baseline",
  );
});

test("кожен файл baseline існує на диску", () => {
  for (const entry of floatingPromisesBaseline) {
    assert.ok(
      existsSync(path.join(REPO_ROOT, entry)),
      `baseline вказує на неіснуючий файл: ${entry} (видалений? перейменований? — прожени --bump)`,
    );
  }
});

/** Мінімальний glob→RegExp рівно під ті патерни, що тут використані. */
function globToRegExp(glob) {
  const GLOBSTAR = "__GLOBSTAR__";
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, GLOBSTAR)
    .replace(/\*\*/g, GLOBSTAR)
    .replace(/\*/g, "[^/]*")
    .split(GLOBSTAR)
    .join(".*");
  return new RegExp(`^${escaped}$`);
}

test("жоден запис baseline не лежить у сліпій зоні type-aware блоку", () => {
  // Файл, який type-aware блок і так ігнорує, не може порушувати правило —
  // отже запис для нього мертвий і лише роздуває список. Це та сама хвороба,
  // що й stale-запис, просто помітна без запуску ESLint.
  const [typeAwareBlock] = typeAwareBlocks;
  const ignores = typeAwareBlock.ignores ?? [];
  assert.ok(ignores.length > 0, "очікував непорожній список сліпих зон");
  for (const entry of floatingPromisesBaseline) {
    for (const glob of ignores) {
      assert.ok(
        !globToRegExp(glob).test(entry),
        `baseline-запис ${entry} уже покритий ignore-патерном ${glob}`,
      );
    }
  }
});

test("порожній baseline не ламає flat-config", () => {
  // Регресія, зловлена при розробці: flat-config відхиляє `files: []`, тож
  // наївний блок упав би рівно того дня, коли борг догребли до нуля —
  // найгірший момент, щоб зламати лінт.
  for (const block of typeAwareBlocks) {
    if (!block.files) continue;
    assert.ok(
      Array.isArray(block.files) && block.files.length > 0,
      "flat-config не приймає порожній files:",
    );
  }
});

test("globToRegExp розуміє патерни, на яких ґрунтується попередній тест", () => {
  assert.ok(globToRegExp("apps/web/tests/**").test("apps/web/tests/a11y/x.ts"));
  assert.ok(
    globToRegExp("apps/*/*.config.ts").test("apps/landing/vite.config.ts"),
  );
  assert.ok(
    !globToRegExp("apps/*/*.config.ts").test("apps/web/src/a/b.config.ts"),
  );
  assert.ok(globToRegExp("apps/web/src/sw.ts").test("apps/web/src/sw.ts"));
  assert.ok(!globToRegExp("apps/web/tests/**").test("apps/web/src/main.tsx"));
});

test("кореневі eslint.*.js зареєстровані в turbo globalDependencies", () => {
  // AGENTS.md § Verification before PR: «Додаєш кореневий конфіг-файл
  // лінтера — додай його в globalDependencies, інакше повертаєш фальшивий
  // зелений». Доти правило трималося лише на памʼяті рев'юера, а ціна
  // забудькуватості — `turbo run lint` рапортує `cached` на дереві, яке
  // `--force` валить. Цей PR додає два таких файли, тож заразом ставимо
  // механічну перевірку на всі.
  // turbo.json — JSONC (з коментарями), тож читаємо секцію текстом: парсер
  // JSON тут падає, а тягнути залежність заради одного масиву не варто.
  const turboSource = readFileSync(path.join(REPO_ROOT, "turbo.json"), "utf8");
  const section = turboSource.slice(
    turboSource.indexOf('"globalDependencies"'),
  );
  const declared = new Set(
    (section.slice(0, section.indexOf("]")).match(/"([^"]+\.js|[^"]+)"/g) ?? [])
      .map((quoted) => quoted.slice(1, -1))
      .filter((entry) => entry !== "globalDependencies"),
  );
  assert.ok(declared.size > 0, "не вдалося прочитати globalDependencies");
  const rootConfigs = readdirSync(REPO_ROOT).filter(
    (f) => /^eslint\..*\.js$/.test(f) || f === "eslint.config.js",
  );
  assert.ok(
    rootConfigs.length > 0,
    "не знайшов жодного кореневого eslint.*.js",
  );
  for (const file of rootConfigs) {
    assert.ok(
      declared.has(file),
      `${file} не в turbo.json → globalDependencies: зміна правила в ньому не інвалідує кеш lint`,
    );
  }
});
