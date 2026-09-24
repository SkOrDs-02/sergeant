/**
 * Last validated: 2026-09-24
 * Status: Active
 *
 * Гейт копії помилок, які сервер віддає людині.
 *
 * Клієнт показує серверний текст ПЕРШИМ і лише потім свій
 * (`err.serverMessage || …`, девʼять місць у `apps/web`), а правило
 * `sergeant-design/ukrainian-copy` на сервері навмисно вузьке: `email/**`,
 * `telegram/**`, сторінка відписки (замір 2026-09-15 у `eslint.server.js`:
 * промпт і копія лежать в одних файлах, і 129 із 135 влучань були б тире в
 * промптах). Тому аудит копі 2026-09-23 (§2.4) знайшов чотири «невірний» і
 * англіцизм «credentials» у тілах відповідей, яких жоден гейт не бачив.
 *
 * Цей тест не розширює скоуп правила. Він дивиться лише на літерали в
 * ПОЗИЦІЯХ помилок, тобто там, де текст за визначенням адресований людині:
 * аргумент `AppError(...)` і поля `error:` / `message:` у тілі відповіді.
 * Промпти, описи інструментів і внутрішні інваріанти сюди не потрапляють,
 * бо не стоять у цих позиціях.
 *
 * Що ловиться, за каноном `docs/product/copy/style-guide.uk.md`:
 *   - §7: калька «невірний», «будь ласка», «на жаль», «успішно», «зачекайте»;
 *   - §1.1: формальне «Ви/Вам/Вас/Ваш» та імператив множини за закінченням
 *     (та сама форма, що в `ukrainian-copy`: основа + «-те» після
 *     приголосного/й/ь або «-іть»);
 *   - §1.9: довге тире.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SERVER_SRC = join(import.meta.dirname, "..");

/** Теки, де кирилиця адресована моделі або розробнику, а не людині. */
const SKIP_DIRS = new Set(["toolDefs", "toolEval", "__tests__", "__mocks__"]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry) || entry === "node_modules") continue;
      collectSourceFiles(full, out);
      continue;
    }
    if (!/\.ts$/.test(entry)) continue;
    if (entry.includes(".test.") || entry.endsWith("prompts.ts")) continue;
    out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, p: string) =>
      p.concat(" ".repeat(m.length - p.length)),
    );
}

/** Літерал у позиції помилки: `AppError("…")`, `error: "…"`, `message: "…"`. */
const ERROR_POSITION =
  /(?:AppError\(|\berror:\s*|\bmessage:\s*)(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g;

const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

const CHECKS: Array<{ id: string; test: (s: string) => boolean }> = [
  { id: "§7 «невірний» (калька)", test: (s) => /[Нн]евірн/.test(s) },
  { id: "§7 «будь ласка»", test: (s) => /[Бб]удь ласка/.test(s) },
  { id: "§7 «на жаль»", test: (s) => /[Нн]а жаль/.test(s) },
  { id: "§7 «успішно»", test: (s) => /[Уу]спішно/.test(s) },
  { id: "§7 «зачекайте»", test: (s) => /[Зз]ачекайте/.test(s) },
  {
    id: "§1.1 формальне «Ви»",
    test: (s) =>
      /(^|[\s"'`>(«])(Ви|Вас|Вам|Ваш[а-яіїєґ]*)([\s,.!?»]|$)/.test(s),
  },
  {
    id: "§1.1 імператив множини",
    test: (s) => {
      const re =
        /(^|[\s"'`>(«])([а-яіїєґА-ЯІЇЄҐʼ]{2,}(?:[^аеиоуіїєюяАЕИОУІЇЄЮЯ\s"'`>(«]те|іть)(?:ся|сь)?)(?=[\s,.!?»…:;)]|$)/g;
      const stop = new Set(["навіть", "росте", "просте", "чисте", "пусте"]);
      let m: RegExpExecArray | null;
      while ((m = re.exec(s)) !== null) {
        if (m[0] === "") {
          re.lastIndex += 1;
          continue;
        }
        if (!stop.has((m[2] ?? "").toLowerCase())) return true;
      }
      return false;
    },
  },
  {
    id: "§1.9 довге тире",
    test: (s) =>
      s.trim() !== "—" && /\S\s*—\s*\S|^\s*—\s*\S|\S\s*—\s*$/.test(s),
  },
];

interface Offender {
  file: string;
  line: number;
  text: string;
  rule: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of collectSourceFiles(SERVER_SRC)) {
    const rel = relative(SERVER_SRC, file).replace(/\\/g, "/");
    const clean = stripComments(readFileSync(file, "utf8"));
    for (const match of clean.matchAll(ERROR_POSITION)) {
      const value = match[1] ?? match[2] ?? match[3];
      if (value == null || !CYRILLIC.test(value)) continue;
      for (const check of CHECKS) {
        if (!check.test(value)) continue;
        offenders.push({
          file: rel,
          line: clean.slice(0, match.index).split("\n").length,
          text: value.slice(0, 80),
          rule: check.id,
        });
      }
    }
  }
  return offenders;
}

describe("копія помилок сервера за каноном (аудит копі 2026-09-23 §2.4)", () => {
  it("сканер бачить достатньо файлів, щоб перевірка щось означала", () => {
    expect(collectSourceFiles(SERVER_SRC).length).toBeGreaterThan(150);
  });

  it("літерали в позиціях помилок не містять заборонених форм", () => {
    expect(
      findOffenders().map((o) => `${o.file}:${o.line} [${o.rule}] «${o.text}»`),
    ).toEqual([]);
  });
});
