/**
 * Unit tests for `sergeant-design/no-sentence-in-caption`.
 *
 * Правило ловить речення, набране роллю `.text-style-caption` (12px) —
 * найдрібнішою в шкалі, призначеною для мети (час, лічильник, одиниця).
 * Розбір і рішення по кожному типу тексту:
 * `docs/05-design/design/density-hierarchy-spec.md` §4–5.
 *
 * Тести стережуть не лише спрацювання, а й ГЛУШНИКИ — саме вони роблять
 * гейт придатним для життя: підказка під контролом, дисклеймер і компактна
 * пара в картці мусять лишатись дрібними, і правило не має за ними ганятись.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import path from "node:path";
import plugin from "../index.js";

const linter = new Linter();
const RULE_ID = "sergeant-design/no-sentence-in-caption";

/** Речення на 60+ знаків — рівно те, що правило вважає текстом для читання. */
const SENTENCE =
  "Записуй витрати вручну, або підключи банк, щоб транзакції підтягувались самі.";
/** Коротка мета: те, для чого роль і призначена. */
const META = "оновлено щойно";

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function lint(
  code,
  filename = abs("apps/web/src/modules/finyk/Foo.tsx"),
  options = [],
) {
  return linter.verify(
    code,
    {
      files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
      plugins: { "sergeant-design": plugin },
      rules: { [RULE_ID]: ["warn", ...options] },
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    { filename },
  );
}

describe("no-sentence-in-caption", () => {
  it("ловить речення в caption", () => {
    const msgs = lint(`
      function Foo() {
        return <p className="text-style-caption text-muted">${SENTENCE}</p>;
      }
    `);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].ruleId, RULE_ID);
    assert.match(msgs[0].message, /text-style-body/);
  });

  it("ловить речення в caption усередині cn()", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <p className={cn("mt-1 text-style-caption", muted && "text-muted")}>
            ${SENTENCE}
          </p>
        );
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("мовчить на короткій меті", () => {
    const msgs = lint(`
      function Foo() {
        return <span className="text-style-caption">${META}</span>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("мовчить на body — це і є правильна відповідь", () => {
    const msgs = lint(`
      function Foo() {
        return <p className="text-style-body text-muted">${SENTENCE}</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("мовчить на латиниці: правило про UA-копію, не про будь-який текст", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <p className="text-style-caption">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do.
          </p>
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("глушиться коментарем AI-NOTE поруч", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <>
            {/* AI-NOTE: підказка під полем вводу — кегль узгоджений з
                висотою інпута поруч, 15px читався б як другий інпут. */}
            <p className="text-style-caption">${SENTENCE}</p>
          </>
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("не глушиться ЗГАДКОЮ маркера в тексті коментаря", () => {
    // Регресія на рев'ю CodeRabbit (PR #1033): вільна згадка `AI-NOTE`
    // усередині рядка прибирала б попередження, не лишивши жодної
    // причини — тобто навпаки до задуму гейта.
    const msgs = lint(`
      function Foo() {
        return (
          <>
            {/* треба буде додати AI-NOTE колись потім */}
            <p className="text-style-caption">${SENTENCE}</p>
          </>
        );
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("не глушиться маркером без двокрапки", () => {
    // Канонічна форма — та сама, що вимагає `ai-marker-syntax`:
    // якір на початку рядка плюс `:` з пробілом.
    const msgs = lint(`
      function Foo() {
        return (
          <>
            {/* AI-NOTE підказка під полем вводу */}
            <p className="text-style-caption">${SENTENCE}</p>
          </>
        );
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("глушиться канонічним AI-DANGER:", () => {
    const msgs = lint(`
      function Foo() {
        return (
          <>
            {/* AI-DANGER: кегль тут тримає геометрію рядка в сітці. */}
            <p className="text-style-caption">${SENTENCE}</p>
          </>
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("не глушиться коментарем задалеко вгорі", () => {
    const msgs = lint(`
      function Foo() {
        // AI-NOTE: це про щось інше, за десять рядків звідси.
        const a = 1;
        const b = 2;
        const c = 3;
        const d = 4;
        const e = 5;
        const f = 6;
        return <p className="text-style-caption">${SENTENCE}</p>;
      }
    `);
    assert.equal(msgs.length, 1);
  });

  it("не рахує текст ВКЛАДЕНОГО вузла — у нього своя роль", () => {
    // Обгортка на caption, але речення живе в дочірньому body-вузлі:
    // питання до кегля там, а не тут, інакше правило вимагало б
    // піднімати контейнер через дитину.
    const msgs = lint(`
      function Foo() {
        return (
          <div className="text-style-caption">
            <p className="text-style-body">${SENTENCE}</p>
          </div>
        );
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("мовчить на тілі зі словника — літерала в JSX немає", () => {
    // Половину заміру дають саме такі місця, і статичний аналіз JSX їх
    // не бачить у принципі. Це не діра, а межа інструмента: словник
    // рахує `scripts/scan-caption-sentences.mjs`.
    const msgs = lint(`
      function Foo() {
        return <p className="text-style-caption">{m.section.body}</p>;
      }
    `);
    assert.equal(msgs.length, 0);
  });

  it("мовчить у тестах, сторіз і DesignShowcase", () => {
    const code = `
      function Foo() {
        return <p className="text-style-caption">${SENTENCE}</p>;
      }
    `;
    for (const f of [
      "apps/web/src/modules/finyk/Foo.test.tsx",
      "apps/web/src/modules/finyk/Foo.stories.tsx",
      "apps/web/src/core/DesignShowcase/sections/Typography.tsx",
    ]) {
      assert.equal(lint(code, abs(f)).length, 0, f);
    }
  });

  it("поважає власний поріг", () => {
    const short = "Коротка підказка про поле.";
    assert.equal(
      lint(
        `<p className="text-style-caption">${short}</p>;`,
        abs("apps/web/src/modules/finyk/Foo.tsx"),
        [{ minLength: 10 }],
      ).length,
      1,
    );
    assert.equal(
      lint(
        `<p className="text-style-caption">${short}</p>;`,
        abs("apps/web/src/modules/finyk/Foo.tsx"),
      ).length,
      0,
    );
  });
});
