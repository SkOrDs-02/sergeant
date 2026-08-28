/**
 * Unit tests for the `sergeant-design/ukrainian-copy` rule.
 *
 * Канон: `docs/01-product/copy/style-guide.uk.md` §1.1 (звертання на «ти»),
 * §1.9 (без довгого тире), §2 (без 1-ї особи множини).
 *
 * Найважливіші кейси тут — НЕ порушення: правило ходить лише по рядкових
 * літералах і JSX-тексту, тож розробницьке «ми» в коментарях і англійська
 * копія мають лишатись мовчазними. Саме на цьому правило найлегше зробити
 * нестерпно шумним.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/ukrainian-copy";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(code, filename = abs("apps/web/src/Foo.tsx")) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: "error" },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

const ids = (msgs) => msgs.map((m) => m.messageId).sort();

describe("ukrainian-copy — формальне «Ви» (§1.1)", () => {
  it("ловить займенник «Ви» та його форми", () => {
    for (const s of [
      '"Ви офлайн"',
      '"Ваш план"',
      '"Це для вас"'.replace("вас", "Вас"),
    ]) {
      assert.ok(lint(`const a = ${s};`).length > 0, s);
    }
  });

  it("ловить імператив множини", () => {
    assert.deepEqual(ids(lint('const a = "Спробуйте пізніше.";')), [
      "formalVy",
    ]);
    assert.deepEqual(ids(lint('const a = "Введіть email";')), ["formalVy"]);
  });

  it("мовчить на наказовій формі однини", () => {
    assert.deepEqual(lint('const a = "Спробуй ще раз.";'), []);
    assert.deepEqual(lint('const a = "Введи email";'), []);
  });

  it("не плутає «Ви» зі складом усередині слова", () => {
    assert.deepEqual(lint('const a = "Виберу пізніше";'), []);
    assert.deepEqual(lint('const a = "Виписка готова";'), []);
  });
});

describe("ukrainian-copy — довге тире (§1.9)", () => {
  it("ловить «—» між частинами речення", () => {
    assert.deepEqual(ids(lint('const a = "Немає звязку — перевір мережу.";')), [
      "emDash",
    ]);
  });

  it("пропускає самотнє «—» як плейсхолдер порожнього значення", () => {
    assert.deepEqual(lint('const a = "—";'), []);
    assert.deepEqual(lint('const a = `${x ?? "—"} грн`;'), []);
  });

  it("пропускає коротке тире «–» (§9а)", () => {
    assert.deepEqual(lint('const a = "Акаунт – обліковий запис";'), []);
  });

  it("ловить тире на МЕЖІ інтерполяції в template-літералі", () => {
    // Регресія: поки перевірявся кожен квазі окремо, тут не збігалось
    // нічого — у «Немає » тире нема, а в « — перевір мережу» перед ним
    // початок рядка, тож `\S\s*—` не спрацьовував (ревʼю CodeRabbit).
    assert.deepEqual(ids(lint("const a = `Немає ${name} — перевір мережу`;")), [
      "emDash",
    ]);
  });

  it("ловить тире, коли квазі перед ним ПОРОЖНІЙ", () => {
    // Друга регресія на тій самій межі (ревʼю CodeRabbit). Склейка
    // пробілом лікувала лише випадок, коли ліворуч від тире вже є текст;
    // тут квазі це ["", " — перевір мережу"], тож перед тире самі
    // пробіли — і порушення знову проходило повз.
    assert.deepEqual(ids(lint("const a = `${name} — перевір мережу`;")), [
      "emDash",
    ]);
  });

  it("ловить тире між двома інтерполяціями", () => {
    assert.deepEqual(ids(lint("const a = `${sum} — ${limit} гривень`;")), [
      "emDash",
    ]);
  });

  it("не повідомляє двічі про той самий template-літерал", () => {
    // Перевіряємо саме ідентифікатори, а не кількість: `Спробуйте` дає
    // ще й `formalVy`, тож `length === 2` пройшло б і тоді, коли правило
    // двічі сказало `emDash` і зовсім проґавило звертання (нітпік
    // CodeRabbit).
    assert.deepEqual(ids(lint("const a = `Спробуйте ${n} — ще раз`;")), [
      "emDash",
      "formalVy",
    ]);
  });
});

describe("ukrainian-copy — апостроф (§1.10)", () => {
  // Форми будуються з кодпоінтів: якщо колись знову поїде масова заміна
  // апострофа, вона не зможе тихо сплющити ці кейси в один символ.
  const ASCII = "\u0027";
  const TYPO = "\u2019";
  const CANON = "\u02BC";

  it("три символи в тесті справді різні", () => {
    assert.equal(new Set([ASCII, TYPO, CANON]).size, 3);
  });

  it(`ловить ASCII-апостроф між літерами`, () => {
    assert.deepEqual(ids(lint(`const a = "ім${ASCII}я оновлено";`)), [
      "apostrophe",
    ]);
  });

  it("ловить типографську лапку між літерами", () => {
    assert.deepEqual(ids(lint(`const a = "зв${TYPO}язок втрачено";`)), [
      "apostrophe",
    ]);
  });

  it("мовчить на канонічному «ʼ»", () => {
    assert.deepEqual(lint(`const a = "ім${CANON}я оновлено";`), []);
  });

  it("не чіпає лапки НАВКОЛО слова — це не апостроф", () => {
    // Тут `'` обрамляє слово, а не стоїть між літерами. Правило, яке
    // ловило б і це, було б нестерпно шумним на кожному вкладеному рядку.
    assert.deepEqual(lint(`const a = "натисни ${ASCII}Готово${ASCII}";`), []);
  });

  it("не чіпає англійські контракції", () => {
    assert.deepEqual(lint(`const a = "Don${ASCII}t panic";`), []);
  });

  it("ловить апостроф у JSX-тексті", () => {
    assert.deepEqual(ids(lint(`const a = <p>Мої м${ASCII}язи</p>;`)), [
      "apostrophe",
    ]);
  });

  it("ловить апостроф у template-літералі", () => {
    assert.deepEqual(ids(lint(`const a = \`Твоє ім${ASCII}я: \${name}\`;`)), [
      "apostrophe",
    ]);
  });
});

describe("ukrainian-copy — 1-а особа множини (§2)", () => {
  it("ловить «ми» та дієслівні закінчення множини", () => {
    assert.deepEqual(ids(lint('const a = "Ми не радимо це робити.";')), [
      "firstPersonPlural",
    ]);
    assert.deepEqual(ids(lint('const a = "Завантажуємо…";')), [
      "firstPersonPlural",
    ]);
  });

  it("мовчить на 1-й особі однини та іменнику", () => {
    assert.deepEqual(lint('const a = "Завантажую…";'), []);
    assert.deepEqual(lint('const a = "Завантаження…";'), []);
    assert.deepEqual(lint('const a = "Не раджу навантажувати цю групу.";'), []);
  });

  it("не чіпає «ми» як закінчення орудного відмінка", () => {
    assert.deepEqual(lint('const a = "Керуй звичками зручно";'), []);
  });
});

describe("ukrainian-copy — межі застосування", () => {
  it("НЕ ходить по коментарях (розробницьке «ми» там легітимне)", () => {
    assert.deepEqual(
      lint("// Ми свідомо не кешуємо це — див. ADR-0078\nconst a = 1;"),
      [],
    );
    assert.deepEqual(lint("/* Спробуйте — і побачите */\nconst a = 1;"), []);
  });

  it("мовчить на рядках без кирилиці", () => {
    assert.deepEqual(lint('const a = "Try again — really";'), []);
  });

  it("ловить JSX-текст, не лише літерали", () => {
    assert.deepEqual(ids(lint("const a = <p>Спробуйте пізніше.</p>;")), [
      "formalVy",
    ]);
  });

  it("пропускає тести та stories", () => {
    const code = 'const a = "Спробуйте пізніше.";';
    assert.deepEqual(lint(code, abs("apps/web/src/Foo.test.tsx")), []);
    assert.deepEqual(lint(code, abs("apps/web/src/Foo.stories.tsx")), []);
    assert.deepEqual(lint(code, abs("apps/web/src/__tests__/Foo.tsx")), []);
  });
});
