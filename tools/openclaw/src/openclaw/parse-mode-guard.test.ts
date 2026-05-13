/**
 * Regression guard для інциденту 2026-05-03 (PR #1568): HELP_TEXT був
 * відправлений з `parse_mode: "Markdown"`, але містив `[tool] [csv]
 * [p0|p1] [topic]` (квадратні дужки без `(url)`) і непарну кількість
 * `_` через `recorded_at`, `Sergeant_alert_bot`, `_Phase ..._`. Telegram
 * повернув 400 "Can't find end of the entity at byte offset 1568",
 * webhook handler впав з 500, користувач сидів у тиші.
 *
 * Цей файл — статичний sentry проти reintroduce-у:
 *   1) HELP_TEXT — справжній HTML, з збалансованими тегами і без
 *      forbidden-тегів.
 *   2) handler.ts не має `parse_mode: "Markdown"` що загортає long-form
 *      const з суфіксом *_TEXT / *_MESSAGE / *_HELP / *_REPLY (саме та
 *      категорія, яка вибухнула 2026-05-03). Короткі inline-літерали
 *      типу `"*Cofounder synthesis…*"` дозволені — там ризику нема.
 *   3) HELP_TEXT не парсить-ся як legacy Markdown — позитивне підтвердження
 *      того, чому fix-у потрібен HTML-режим, а не "просто escape брекети".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { HELP_TEXT } from "./handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLER_SRC = readFileSync(join(__dirname, "handler.ts"), "utf8");

// Telegram HTML mode: subset of HTML. Лише ці теги дозволені; кожен
// open-tag мусить мати парний close-tag (порядок stack-based).
// https://core.telegram.org/bots/api#html-style
const HTML_TAG_RE = /<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/gi;
const HTML_ALLOWED = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ins",
  "s",
  "strike",
  "del",
  "span",
  "tg-spoiler",
  "a",
  "code",
  "pre",
  "blockquote",
  "br",
]);
// Tags які не потребують close-tag-у (void elements у Telegram-HTML).
const HTML_VOID = new Set(["br"]);

function validateTelegramHtml(text: string): void {
  const stack: Array<{ tag: string; offset: number }> = [];
  for (const m of text.matchAll(HTML_TAG_RE)) {
    const closing = m[1] === "/";
    const tag = (m[2] ?? "").toLowerCase();
    const offset = m.index ?? 0;
    if (!HTML_ALLOWED.has(tag)) {
      throw new Error(
        `Forbidden Telegram-HTML tag <${closing ? "/" : ""}${tag}> at offset ${offset}. Allowed: ${[
          ...HTML_ALLOWED,
        ].join(", ")}.`,
      );
    }
    if (HTML_VOID.has(tag)) continue;
    if (closing) {
      const top = stack.pop();
      if (!top) {
        throw new Error(`Stray </${tag}> with no opener at offset ${offset}.`);
      }
      if (top.tag !== tag) {
        throw new Error(
          `Tag mismatch: expected </${top.tag}> (opened at offset ${top.offset}), got </${tag}> at offset ${offset}.`,
        );
      }
    } else {
      stack.push({ tag, offset });
    }
  }
  if (stack.length > 0) {
    throw new Error(
      `Unclosed Telegram-HTML tags: ${stack
        .map((s) => `<${s.tag}>@${s.offset}`)
        .join(", ")}.`,
    );
  }
}

// Telegram legacy Markdown (parse_mode: "Markdown"): bold (`*..*`),
// italic (`_.._`), inline code (`` ` `` ` ``), links `[text](url)`.
// Парсер дуже строгий: непарна кількість маркерів → 400 "Can't find
// end of the entity"; `[...]` без `(...)` → 400 теж. Цей валідатор
// відтворює ці граматичні правила (best-effort, достатньо для catch-у
// HELP_TEXT-розміру повідомлень).
function validateTelegramLegacyMarkdown(text: string): void {
  const counts = { star: 0, underscore: 0, backtick: 0 };
  for (const c of text) {
    if (c === "*") counts.star++;
    else if (c === "_") counts.underscore++;
    else if (c === "`") counts.backtick++;
  }
  for (const [name, count] of Object.entries(counts)) {
    if (count % 2 !== 0) {
      throw new Error(
        `Unbalanced ${name}: count=${count} (must be even). Snippet: ${JSON.stringify(
          text.slice(0, 80),
        )}…`,
      );
    }
  }
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("[", i);
    if (open < 0) break;
    // Skip escaped: legacy Markdown does not have `\[`-escape, але якщо
    // у тексті стоїть `\\[` ми все одно вважаємо це non-escape — бо
    // Telegram теж так вважає.
    const close = text.indexOf("]", open + 1);
    if (close < 0) {
      throw new Error(
        `Unclosed '[' at offset ${open}: ${JSON.stringify(text.slice(open, open + 60))}…`,
      );
    }
    const after = text[close + 1];
    if (after !== "(") {
      throw new Error(
        `'[…]' without trailing '(…)' at offset ${open}: ${JSON.stringify(
          text.slice(open, close + 2),
        )}. Telegram Markdown expects link syntax [text](url).`,
      );
    }
    i = close + 1;
  }
}

describe("OpenClaw parse_mode integrity (regression PR #1568)", () => {
  it("HELP_TEXT is valid Telegram-HTML — balanced, allowed tags only", () => {
    expect(() => validateTelegramHtml(HELP_TEXT)).not.toThrow();
  });

  it("HELP_TEXT would crash legacy Markdown parser — proves the HTML fix was necessary", () => {
    // 2026-05-03 incident: Telegram повертав 400 на цей самий текст у
    // Markdown-режимі. Якщо хтось намагатиметься повернути legacy
    // Markdown — цей assert одразу зловить (a) bracket-without-paren
    // на `[tool]`, (b) unbalanced `_` на `Sergeant_alert_bot`.
    expect(() => validateTelegramLegacyMarkdown(HELP_TEXT)).toThrow();
  });

  it("validateTelegramHtml — sanity-check the validator", () => {
    expect(() => validateTelegramHtml("<b>x</b>")).not.toThrow();
    expect(() => validateTelegramHtml("<b>x")).toThrow(/Unclosed/);
    expect(() => validateTelegramHtml("<b>x</i>")).toThrow(/Tag mismatch/);
    expect(() => validateTelegramHtml("</b>")).toThrow(/Stray/);
    expect(() => validateTelegramHtml("<script>x</script>")).toThrow(
      /Forbidden/,
    );
    expect(() =>
      validateTelegramHtml("<b><i><code>x</code></i></b>"),
    ).not.toThrow();
    expect(() => validateTelegramHtml("ok no tags here")).not.toThrow();
  });

  it("validateTelegramLegacyMarkdown — sanity-check the validator", () => {
    expect(() => validateTelegramLegacyMarkdown("*ok*")).not.toThrow();
    expect(() => validateTelegramLegacyMarkdown("*ok")).toThrow(/Unbalanced/);
    expect(() => validateTelegramLegacyMarkdown("a_b_c")).not.toThrow();
    expect(() => validateTelegramLegacyMarkdown("a_b")).toThrow(/Unbalanced/);
    expect(() => validateTelegramLegacyMarkdown("[link](url)")).not.toThrow();
    expect(() => validateTelegramLegacyMarkdown("[oops]")).toThrow(/without/);
    expect(() => validateTelegramLegacyMarkdown("`code`")).not.toThrow();
    expect(() => validateTelegramLegacyMarkdown("`code")).toThrow(/Unbalanced/);
  });

  it('handler.ts does not wrap a long-form *_TEXT/*_MESSAGE/*_HELP const with legacy parse_mode: "Markdown"', () => {
    // Шукаємо паттерн виду `parse_mode: "Markdown"` і дивимось 8 рядків
    // вище — якщо там згадка HELP_TEXT / FOO_TEXT / FOO_MESSAGE /
    // FOO_HELP / FOO_REPLY — fail, бо такі змінні майже завжди довгі і
    // майже завжди мають bracket-or-underscore-bug.
    const lines = HANDLER_SRC.split("\n");
    const offending: string[] = [];
    const RE_LONG_CONST =
      /\b(HELP_TEXT|[A-Z][A-Z0-9_]+_(?:TEXT|MESSAGE|HELP|REPLY))\b/;
    const RE_LEGACY_MD = /parse_mode:\s*"Markdown"/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (!RE_LEGACY_MD.test(line)) continue;
      // 8-line look-back covers multi-line `await ctx.reply(... { ... })` calls.
      const ctx = lines.slice(Math.max(0, i - 8), i + 1).join("\n");
      const match = ctx.match(RE_LONG_CONST);
      if (match) {
        offending.push(
          `handler.ts:${i + 1} → ${line.trim()} (refers to ${match[0]} above; use parse_mode: "HTML" instead)`,
        );
      }
    }
    expect(offending).toEqual([]);
  });

  it("handler.ts only uses parse_mode values from the allowed set", () => {
    // Telegram supports "Markdown" (legacy), "MarkdownV2", "HTML". Будь-яка
    // інша строка → 400 на send. Catch-у typo-повертань (e.g. "Md", "Html").
    const ALLOWED = new Set(["Markdown", "MarkdownV2", "HTML"]);
    const re = /parse_mode:\s*"([^"]+)"/g;
    const seen = new Set<string>();
    for (const m of HANDLER_SRC.matchAll(re)) {
      if (m[1] !== undefined) seen.add(m[1]);
    }
    const invalid = [...seen].filter((v) => !ALLOWED.has(v));
    expect(invalid).toEqual([]);
  });
});
