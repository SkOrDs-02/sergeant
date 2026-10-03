/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Гейт проти повернення тихої дірки в Hard Rule #26: список файлів PR
 * мусить бути повним, інакше скрипт не має права вирішувати, що
 * канонічних доків «не торкались».
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertCompleteFileList,
  CANONICAL_DOC_ROOTS,
  entryKey,
} from "../update-pr-backlinks.mjs";

test("повний список проходить мовчки", () => {
  assert.doesNotThrow(() => assertCompleteFileList(956, 956, 1081));
  assert.doesNotThrow(() => assertCompleteFileList(0, 0, 1));
});

test("обрізаний список — помилка, а не тихий нуль", () => {
  assert.throws(
    () => assertCompleteFileList(100, 956, 1081),
    /fetched 100 changed file\(s\) but the API reports 956/,
  );
});

test("у тексті помилки є номер PR і згадка про стелю API", () => {
  try {
    assertCompleteFileList(3000, 4200, 777);
    assert.fail("мало кинути");
  } catch (err) {
    assert.match(err.message, /#777/);
    assert.match(err.message, /3000/);
  }
});

test("невідома кількість (поле відсутнє) не валить прогін", () => {
  // `changedFiles` може не приїхати зі старішого gh — тоді звіряти нічого,
  // і гейт не має падати на самій лише відсутності поля.
  assert.doesNotThrow(() => assertCompleteFileList(5, undefined, 1));
  assert.doesNotThrow(() => assertCompleteFileList(5, null, 1));
});

/**
 * Ключ запису. Номер PR сам по собі НЕ унікальний: Bitbucket почав нумерацію
 * заново з одиниці, а в реєстрі вже лежать номери 29..3665 із трьох GitHub-репо.
 * Коли Bitbucket дійде до #29, ключ по самому номеру почав би вважати два різні
 * PR одним і мовчки перезаписав би старіший запис.
 */
test("ключ розрізняє однакові номери з різних хостів", () => {
  const bb = entryKey({
    number: 29,
    host: "bitbucket",
    repo: "skords01/sergeant",
  });
  const gh = entryKey({ number: 29, repo: "zaebal-beep/sergeant" });
  assert.notEqual(bb, gh);
});

test("відсутній host читається як github, відсутній repo — як легасі", () => {
  assert.equal(
    entryKey({ number: 7 }),
    entryKey({ number: 7, host: "github" }),
  );
  assert.match(entryKey({ number: 7 }), /^github:/);
});

test("той самий PR дає той самий ключ", () => {
  const e = { number: 6, host: "bitbucket", repo: "skords01/sergeant" };
  assert.equal(entryKey(e), entryKey({ ...e, title: "інший заголовок" }));
});

/**
 * Третій можливий збій того самого реєстру — і єдиний, який ще не стався.
 *
 * Список канонічних тек живе у ДВОХ місцях: `CANONICAL_DOC_ROOTS` тут і
 * `paths:` у `.github/workflows/pr-backlinks.yml`. Вони мусять збігатися, бо
 * роблять різні половини однієї роботи: `paths:` вирішує, чи ЗАПУСТИТИ
 * воркфлоу, а `CANONICAL_DOC_ROOTS` — що саме записати. Розійдуться — і
 * реєстр замовкне так само тихо, як двічі до того:
 *
 *   • тека є в `paths:`, немає в коренях → воркфлоу біжить, `upsertPR`
 *     виходить на порожньому `touchedDocs`, запису немає;
 *   • тека є в коренях, немає в `paths:` → воркфлоу взагалі не стартує.
 *
 * В обох випадках жодного червоного сигналу: CI зелений, ledger просто не
 * росте. Саме так Hard Rule #26 не виконувалось на цьому форку ЖОДНОГО разу.
 */
function scriptRoots() {
  return CANONICAL_DOC_ROOTS.map((r) => r.rootDir).sort();
}

test("paths: у воркфлоу і CANONICAL_DOC_ROOTS не розходяться", () => {
  const yml = readFileSync(
    new URL("../../../.github/workflows/pr-backlinks.yml", import.meta.url),
    "utf8",
  );
  // Беремо рівно блок `paths:` під `pull_request_target`, не весь файл:
  // слово `paths` трапляється і в коментарях.
  const block = /\n {4}paths:\n((?: {6}- ".*"\n)+)/.exec(yml);
  assert.ok(block, "не знайшов блок `paths:` у воркфлоу");
  const fromWorkflow = [...block[1].matchAll(/- "(.+?)\/\*\*"/g)]
    .map((m) => m[1])
    .sort();
  const fromScript = scriptRoots();
  assert.deepEqual(
    fromWorkflow,
    fromScript,
    "додав теку в одне місце — додай і в друге, інакше ledger замовкне мовчки",
  );
});

/**
 * Четверта копія того самого списку — і найлегша для мовчазного дрейфу, бо
 * вона в JSON, а JSON ніхто не читає очима.
 *
 * `hard-rules.json` — машиночитаний реєстр Hard Rules, і його `scope` для
 * правила #26 перелічує ті самі теки, що й скрипт із воркфлоу. Розійдеться —
 * і правило почне ОПИСУВАТИ не те, що механізм РОБИТЬ: у реєстрі одне, в
 * гейті інше, а розбіжність помітна лише тому, хто відкриє обидва файли.
 *
 * (П'ята копія — прозова секція `## Scope` у тілі правила — навмисно поза
 * цим тестом: вона людська, з винятками в дужках і поясненнями, і зводити її
 * до масиву означало б або збіднити текст, або написати крихкий парсер.
 * Її тримає 3-way sync `pnpm lint:hard-rules-registry`.)
 */
test("scope у hard-rules.json збігається з CANONICAL_DOC_ROOTS", () => {
  const registry = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/governance/governance/hard-rules.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const rules = Array.isArray(registry) ? registry : registry.rules;
  const rule26 = rules.find((r) => r.id === 26);
  assert.ok(rule26, "правила #26 немає в реєстрі");
  const fromRegistry = rule26.scope
    .map((g) => g.replace(/\/\*\.md$/, ""))
    .sort();
  assert.deepEqual(
    fromRegistry,
    scriptRoots(),
    "скоуп правила #26 розійшовся з тим, що насправді сканує гейт",
  );
});
