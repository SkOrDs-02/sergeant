// scripts/__tests__/check-ui-canon-ratchet.test.mjs
//
// Тести на сам храповик. Перевіряють не «скрипт існує», а ті властивості,
// втрата яких зробила б його брехливим — і кожна з них має історію в цьому ж
// PR-і, бо на всіх трьох я спіткнувся, поки його писав:
//
//   1. метрика кнопки міряє РІВНО `<Button>` — перша версія рахувала
//      `variant="danger"` де завгодно і дала 203 «легасі-кнопки», серед них
//      `EmptyState`, `Badge`, `Banner`, у яких це їхній власний канон;
//   2. `<Button>` у рядковому літералі чи коментарі — не call-site (на цьому
//      ж codemod зламав `DropdownMenu.tsx`, переписавши текст помилки);
//   3. коментар МІЖ пропами всередині тега не читається як проп.
//
// Плюс дві базові: пастка `secondary` + `module` і чесність координат.
//
// Run with:  node --test scripts/__tests__/check-ui-canon-ratchet.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  allowlistHits,
  blankComments,
  CANON_RING_OPACITY,
  counts,
  ICON_SIZE_TOKENS,
  maskedRanges,
  scanSource,
  tagEnd,
} from "../check-ui-canon-ratchet.mjs";

const F = "apps/web/src/example.tsx";
const only = (src, metric) =>
  scanSource(F, src).filter((h) => h.metric === metric);

test("канонічна кнопка порушень не дає", () => {
  const src = `
export function A() {
  return (
    <>
      <Button variant="solid" tone="finyk">Додати</Button>
      <Button variant="outline">Скасувати</Button>
      <Button variant="ghost">Закрити</Button>
    </>
  );
}`;
  assert.deepEqual(only(src, "legacyButton"), []);
});

test("легасі-варіант ловиться", () => {
  const src = `<Button variant="secondary">Скасувати</Button>`;
  const hits = only(src, "legacyButton");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /легасі/);
});

test("проп module= ловиться навіть при канонічному variant", () => {
  const src = `<Button variant="solid" module="finyk">Додати</Button>`;
  const hits = only(src, "legacyButton");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /module/);
});

test('ЧУЖИЙ компонент із variant="danger" — НЕ порушення', () => {
  // Сенс тесту: `EmptyState`, `Badge`, `Banner`, `ProgressBar` мають власний
  // канонічний API з тими самими словами. Гейт, що червоніє на них, блокує
  // легальний код.
  const src = `
    <EmptyState variant="danger" title="Помилка" />
    <Badge variant="success">ок</Badge>
    <Banner variant="primary">текст</Banner>`;
  assert.deepEqual(only(src, "legacyButton"), []);
});

test("<Button> у рядковому літералі — не call-site", () => {
  const src = `
    throw new Error(
      "DropdownMenu: trigger must be an element (e.g. <Button variant=\\"secondary\\">…</Button>)",
    );`;
  assert.deepEqual(only(src, "legacyButton"), []);
});

test("<Button> у коментарі — не call-site", () => {
  const src = `
    // приклад: <Button variant="primary">…</Button>
    /* і блоковий: <Button variant="danger" /> */
    const x = 1;`;
  assert.deepEqual(only(src, "legacyButton"), []);
});

test("коментар МІЖ пропами не читається як проп", () => {
  const src = `
    <Button
      variant="solid"
      // історія: тут колись стояв module="finyk" → \`finyk\`
      tone="finyk"
    >
      Додати
    </Button>`;
  assert.deepEqual(only(src, "legacyButton"), []);
});

test("стрілка `=>` у пропі не обриває розбір тега", () => {
  // Саме на цьому обірвався перший скан ConfirmDialog: `>` у `() =>`
  // вважався кінцем тега, і проп нижче ставав невидимим.
  const src = `
    <Button
      onClick={() => doThing()}
      variant="secondary"
    >
      Ок
    </Button>`;
  const hits = only(src, "legacyButton");
  assert.equal(hits.length, 1, "variant після стрілки має бути видимим");
});

test("рукописна фокус-рамка рахується, утиліта — ні", () => {
  const src = `
    <button className="focus-visible:ring-2 focus-visible:ring-focus/45" />
    <button className="focus-ring" />`;
  assert.equal(only(src, "handRolledFocusRing").length, 1);
});

test("згадка фокус-класу в коментарі — не вживання", () => {
  // Регресія 2026-09-15. Метрика рамки сканувала сирий текст, тож докстрінг
  // `routineIconButton.ts` — файла, який рукописну рамку ПРИБИРАЄ, — рахувався
  // як такий, що її додає, і гейт вимагав ратчет угору на неіснуючий борг.
  // Восьмеро таких фантомів сиділи в baseline від народження.
  const src = `
    /**
     * \`IconButton\` успадковує фокус від \`Button\`
     * (\`focus-visible:ring-2 ring-focus/45\`), а утиліта має власний колір.
     */
    // і однорядкова згадка: focus-visible:ring-2
    export const X = "rounded-xl border border-line";`;
  assert.deepEqual(only(src, "handRolledFocusRing"), []);
});

test("фокус-клас у className РАХУЄТЬСЯ — маска рядків тут заборонена", () => {
  // Друга половина тієї ж регресії, і вона важливіша за першу. Спроба
  // перевикористати маску метрики кнопки (`maskedRanges` гасить і рядкові
  // літерали) обвалила замір 235 → 7 і лишила гейт ЗЕЛЕНИМ: фокус-класи
  // живуть саме всередині \`className="…"\`, тож така маска не робить гейт
  // суворішим — вона його вимикає. Цей тест падає, щойно хтось «уніфікує»
  // дві метрики під спільну маску.
  const src = `
    <button className="focus-visible:ring-2 focus-visible:ring-focus/45" />
    <button className={cn("focus-visible:ring-2", extra)} />`;
  assert.equal(only(src, "handRolledFocusRing").length, 2);
});

test("неканонічна непрозорість фокус-токена ловиться, канонічна — ні", () => {
  const src = `
    <a className="focus-visible:ring-2 focus-visible:ring-focus/45" />
    <a className="focus-visible:ring-2 focus-visible:ring-focus/60" />
    <a className="focus-visible:ring-2 focus-visible:ring-focus/30" />`;
  const hits = only(src, "offCanonRingOpacity");
  assert.equal(hits.length, 2, "канонічний /45 не має рахуватись");
  assert.match(hits[0].detail, /60/);
});

test("ring-focus без суфікса — це непрозорість 1.0, а не «дефолт»", () => {
  // Найгучніший із семи варіантів, і саме тому його легко сприйняти за норму.
  const src = `<a className="focus-visible:ring-2 focus-visible:ring-focus" />`;
  const hits = only(src, "offCanonRingOpacity");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /без суфікса/);
});

test("модульні тони НЕ рахуються — там різниця може бути задумом", () => {
  // Та сама помилка, що дала 203 хибні влучання в першій версії метрики
  // кнопки: гейт міряв чужий канон своєю міркою.
  const src = `
    <a className="focus-visible:ring-nutrition/60" />
    <a className="focus-visible:ring-fizruk/50" />
    <a className="focus-visible:ring-finyk" />
    <a className="focus-visible:ring-danger/25" />`;
  assert.deepEqual(only(src, "offCanonRingOpacity"), []);
});

test("канон непрозорості читається з константи, не зашитий у тест", () => {
  const src = `<a className="focus-visible:ring-focus/${CANON_RING_OPACITY}" />`;
  assert.deepEqual(only(src, "offCanonRingOpacity"), []);
});

test("CSS не сканується — там ВИЗНАЧЕННЯ утиліт, не call-site-и", () => {
  // `.input-focus` у `utilities.css` стоїть на `/30` навмисно: це інша роль —
  // кільце БЕЗ офсету, щоб читалось усередині заповненого поля. Порахувати
  // визначення як дрейф означало б вимагати правки самого канону.
  const css = `
    @utility input-focus {
      @apply outline-hidden focus-visible:ring-2 focus-visible:ring-focus/30;
    }`;
  assert.deepEqual(
    scanSource("apps/web/src/styles/utilities.css", css).filter(
      (h) => h.metric === "offCanonRingOpacity",
    ),
    [],
  );
  // А той самий текст у .tsx — уже call-site і має ловитись.
  assert.equal(only(css, "offCanonRingOpacity").length, 1);
});

test("числовий розмір іконки, що збігається з токеном, ловиться", () => {
  const src = `<Icon name="edit" size={16} />`;
  const hits = only(src, "numericIconSize");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /size="md"/);
});

test("ПОЗАШКАЛЬНЕ число НЕ ловиться — токена для нього немає", () => {
  // Числовий API лишається легальним «for one-off cases» (докстрінг `Icon`).
  // Вимагати токен там, де його немає, означало б вимагати зміни ВИГЛЯДУ.
  const src = `
    <Icon name="a" size={13} />
    <Icon name="b" size={18} />
    <Icon name="c" size={22} />`;
  assert.deepEqual(only(src, "numericIconSize"), []);
});

test("токенний розмір порушенням не є", () => {
  const src = `<Icon name="edit" size="md" />`;
  assert.deepEqual(only(src, "numericIconSize"), []);
});

test("size={16} у ЧУЖОМУ компоненті — не порушення", () => {
  // `IconButton` і `Avatar` мають власний розмірний API без цієї шкали.
  // Той самий клас помилки, що дав 203 хибні влучання в метриці кнопки.
  const src = `
    <IconButton size={16} />
    <Avatar size={24} />`;
  assert.deepEqual(only(src, "numericIconSize"), []);
});

// ── 5. allowlist кирилиці — рішення власника 2026-09-16 (EN заморожено,
//      список перестає рости) ──

test("кожен запис allowlist кирилиці — один hit з імʼям файлу", () => {
  const hits = allowlistHits([
    "apps/web/src/core/A.tsx",
    "apps/web/src/core/B.tsx",
  ]);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].metric, "cyrillicJsxAllowlist");
  assert.equal(hits[1].file, "apps/web/src/core/B.tsx");
  assert.equal(counts(hits).cyrillicJsxAllowlist, 2);
});

test("allowlist не масивом — голосна помилка, а не мовчазний нуль", () => {
  // Мовчазний нуль = вимкнений гейт (той самий клас помилки, що й
  // «метрика без baseline» у `main()`).
  assert.throws(() => allowlistHits({ files: [] }), /масивом/);
});

test("лічильник знає про всі шість метрик — інакше baseline-гейт не побачить нову", () => {
  assert.deepEqual(Object.keys(counts([])).sort(), [
    "cyrillicJsxAllowlist",
    "handRolledFocusRing",
    "heroInkAlpha",
    "legacyButton",
    "numericIconSize",
    "offCanonRingOpacity",
  ]);
});

test("шкала читається з константи, не зашита в тест", () => {
  for (const [px, token] of Object.entries(ICON_SIZE_TOKENS)) {
    const hits = only(`<Icon name="a" size={${px}} />`, "numericIconSize");
    assert.equal(hits.length, 1, `${px}px має ловитись`);
    assert.match(hits[0].detail, new RegExp(`size="${token}"`));
  }
});

test("координати чесні — рядок указує у ВИХІДНИЙ файл", () => {
  const src = [
    "// рядок 1",
    "/* рядок 2",
    '   рядок 3 — тут згадано <Button variant="primary" />',
    "*/",
    '<Button variant="danger">Видалити</Button>',
  ].join("\n");
  const hits = only(src, "legacyButton");
  assert.equal(hits.length, 1, "згадка в коментарі не рахується");
  assert.equal(hits[0].line, 5, "справжній call-site — 5-й рядок");
});

test("tagEnd не спотикається на вкладених дужках і рядках", () => {
  const tag = `<Button className={cn("a", { b: true })} onClick={() => f(">")}>`;
  assert.equal(tagEnd(tag, "<Button".length), tag.length - 1);
});

test("blankComments гасить коментарі, але не рядкові літерали", () => {
  const src = 'const a = "// не коментар"; // хвіст';
  const out = blankComments(src);
  assert.equal(out.length, src.length, "довжина має збігатись");
  assert.ok(out.includes('"// не коментар"'), "літерал недоторканий");
  assert.ok(!out.includes("хвіст"), "коментар погашено");
});

test("maskedRanges позначає і рядки, і коментарі", () => {
  const src = 'x = "рядок"; // коментар';
  const bad = maskedRanges(src);
  assert.ok(bad[src.indexOf("рядок")], "рядок має бути замаскований");
  assert.ok(bad[src.indexOf("коментар")], "коментар має бути замаскований");
  assert.ok(!bad[0], "код поза ними — ні");
});

// ── 6. альфа на геро-чорнилі — знахідка WF-23 (аудит шуму 2026-09-16) ──

test("альфа на `text-hero-ink` ловиться і називає рівень", () => {
  const hits = only(`<p className="text-hero-ink/70">x</p>`, "heroInkAlpha");
  assert.equal(hits.length, 1);
  assert.match(hits[0].detail, /text-hero-ink\/70/);
});

test("повна непрозорість `text-hero-ink` порушенням не є", () => {
  // Саме вона і є каноном: на найтемнішому з чотирьох геро-градієнтів
  // (nutrition, lime-700) навіть /100 дає лише 4.67:1 при порозі 4.5.
  assert.deepEqual(
    only(`<p className="text-hero-ink">x</p>`, "heroInkAlpha"),
    [],
  );
});

test("альфа на ІНШОМУ токені метрикою геро-чорнила не рахується", () => {
  // Звужувати чуже — та сама помилка, що дала 203 хибні влучання в
  // метриці кнопки. `text-muted/70` живе на звичайних поверхнях, де
  // контраст рахується інакше.
  assert.deepEqual(
    only(`<p className="text-muted/70 bg-hero-ink/20">x</p>`, "heroInkAlpha"),
    [],
  );
});

test("декор на hero-ink (stroke/bg/border з альфою) не є текстом і не рахується", () => {
  // A9 (2026-10-01): заборонено лише ТЕКСТОВЕ чорнило з альфою. Доріжка
  // кільця (`stroke-hero-ink/20`), ink-wash під комірками (`bg-hero-ink/10`)
  // і контур (`border-hero-ink/20`) до порога 4.5:1 не підлягають, тож
  // метрика їх не чіпає, а baseline = 0 тримається без обхідних хитрощів.
  assert.deepEqual(
    only(
      `<circle className="stroke-hero-ink/20" /><i className="bg-hero-ink/10 border-hero-ink/20" />`,
      "heroInkAlpha",
    ),
    [],
  );
});

test("згадка класу в коментарі не рахується як вживання", () => {
  // Та сама властивість, що й у метрики фокус-рамки: інакше файл, який
  // альфу ПРИБИРАЄ і пояснює це в докстрінгу, вимагав би ратчет угору.
  assert.deepEqual(
    only(`// було text-hero-ink/70, стало повна непрозорість`, "heroInkAlpha"),
    [],
  );
});
