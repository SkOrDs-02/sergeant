/**
 * Відповідь без цифр і блок точних значень від коду (ADR-0097, PR3 їх
 * підключить; тут вони готові й покриті тестами).
 *
 * Коли звірка двічі не пройшла, людина отримує текст, з якого вирізано кожне
 * речення з цифрою, і окремий блок, відрендерений КОДОМ із того, що модель
 * справді бачила. Блок не доручається моделі: інакше вигадане число могло б
 * повернутись у відповідь через ті самі двері.
 *
 * Копія за `docs/product/copy/style-guide.uk.md`: «ти», без довгого тире, без
 * вибачень і заяв про чесність, одиниці через вузький нерозривний пробіл.
 */

import { formatNumberUk } from "@sergeant/shared";

import { extractNumberTokens } from "./extract.js";
import type { NumberUnit } from "./normalize.js";

/** Скільки літер мусить лишитись, щоб текст без цифр ще мав сенс сам по собі. */
export const MIN_VISIBLE_LETTERS = 20;

/** Скільки пар максимум іде в блок: довший список перестає читатись. */
export const MAX_EXACT_VALUES = 12;

export const EXACT_VALUES_TITLE = "Точні значення";

/** Замість стертого тексту, коли є що показати блоком. */
export const NUMBER_FREE_INTRO =
  "Цифри з моєї відповіді не збіглися з твоїми даними, тому лишаю точні значення.";

/** Те саме, коли показати нічого: дія для людини замість порожнечі. */
export const NUMBER_FREE_INTRO_NO_VALUES =
  "Цифри з моєї відповіді не збіглися з твоїми даними. Спитай ще раз, і я перевірю.";

const NNBSP = "\u202F";

/** Речення закінчується `.!?…` (з закривними дужками/зірочками), далі велика літера. */
const SENTENCE_BOUNDARY_RE =
  /(?<=[.!?…][*_)"»”]*)\s+(?=[*_("«“]*[А-ЯІЇЄҐA-Z])/u;

const NUMBERED_ITEM_RE = /^(\s{0,3})(\d{1,2})([.)])(\s+)(.*)$/;
const BULLET_ITEM_RE = /^(\s{0,3})([-*•–])(\s+)(.*)$/;
const HEADING_RE = /^\s{0,3}#{1,6}\s/;
const LABEL_LINE_RE = /^\s*(?:#{1,6}\s+.+|\*\*[^*\n]+\*\*:?|__[^_\n]+__:?)\s*$/;
const TABLE_ROW_RE = /^\s*\|/;
const TABLE_SEPARATOR_RE = /^\s*\|[\s:|-]+\|?\s*$/;

type LineKind = "blank" | "item" | "numbered" | "table" | "label" | "text";

interface OutLine {
  kind: LineKind;
  text: string;
}

const hasDigit = (s: string): boolean => /\d/.test(s);

function splitSentences(line: string): string[] {
  return line.split(SENTENCE_BOUNDARY_RE).filter((s) => s.length > 0);
}

/** Букви без розмітки й розділових знаків: «скільки тут справжнього тексту». */
function visibleLetters(text: string): number {
  return text.replace(/[^\p{L}]/gu, "").length;
}

function filterTableBlock(rows: readonly string[]): string[] {
  const dataRows = rows.filter((r) => !TABLE_SEPARATOR_RE.test(r));
  return dataRows.some(hasDigit) ? [] : [...rows];
}

/** Перший прохід: рядок у рядок, речення з цифрою відпадають цілком. */
function filterLines(text: string): OutLine[] {
  const out: OutLine[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      out.push({ kind: "blank", text: "" });
      continue;
    }
    if (TABLE_ROW_RE.test(line)) {
      const block: string[] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i] ?? "")) {
        block.push(lines[i] ?? "");
        i += 1;
      }
      i -= 1;
      for (const row of filterTableBlock(block)) {
        out.push({ kind: "table", text: row });
      }
      continue;
    }
    const numbered = NUMBERED_ITEM_RE.exec(line);
    if (numbered) {
      // Цифра в самому маркері списку не рахується: перевіряється зміст пункту.
      if (!hasDigit(numbered[5] ?? ""))
        out.push({ kind: "numbered", text: line });
      continue;
    }
    const bullet = BULLET_ITEM_RE.exec(line);
    if (bullet) {
      if (!hasDigit(bullet[4] ?? "")) out.push({ kind: "item", text: line });
      continue;
    }
    if (HEADING_RE.test(line)) {
      if (!hasDigit(line)) out.push({ kind: "label", text: line });
      continue;
    }
    const kept = splitSentences(line).filter((s) => !hasDigit(s));
    if (kept.length === 0) continue;
    const joined = kept.join(" ");
    out.push({
      kind: LABEL_LINE_RE.test(joined) ? "label" : "text",
      text: joined,
    });
  }
  return out;
}

function nextNonBlank(lines: readonly OutLine[], from: number): OutLine | null {
  for (let i = from; i < lines.length; i++) {
    const l = lines[i];
    if (l && l.kind !== "blank") return l;
  }
  return null;
}

/**
 * Другий прохід: прибирає осиротілі заголовки й підводки.
 *
 * Заголовок без жодного рядка після нього, або підводка на кшталт «Ось
 * витрати:», за якою всі пункти стерто, лишились би висіти. Стираємо їх,
 * а не лишаємо «Фінанси» над порожнечею.
 */
function dropOrphans(lines: readonly OutLine[]): OutLine[] {
  const out: OutLine[] = [];
  lines.forEach((line, i) => {
    const next = nextNonBlank(lines, i + 1);
    if (line.kind === "label" && (next === null || next.kind === "label")) {
      return;
    }
    if (line.kind === "text" && line.text.trimEnd().endsWith(":")) {
      const followedByList =
        next !== null &&
        (next.kind === "item" ||
          next.kind === "numbered" ||
          next.kind === "table");
      if (!followedByList) {
        const sentences = splitSentences(line.text);
        sentences.pop();
        if (sentences.length === 0) return;
        out.push({ kind: "text", text: sentences.join(" ") });
        return;
      }
    }
    out.push(line);
  });
  return out;
}

/** Нумерація списків після видалень іде знову з одиниці. */
function renumber(lines: readonly OutLine[]): string[] {
  const out: string[] = [];
  let counter = 0;
  for (const line of lines) {
    if (line.kind !== "numbered") {
      counter = 0;
      out.push(line.text);
      continue;
    }
    counter += 1;
    const m = NUMBERED_ITEM_RE.exec(line.text);
    out.push(
      m
        ? `${m[1] ?? ""}${counter}${m[3] ?? "."}${m[4] ?? " "}${m[5] ?? ""}`
        : line.text,
    );
  }
  return out;
}

/**
 * Вирізає з тексту кожне речення й кожен пункт списку, де є хоч одна цифра.
 *
 * Повертає порожній рядок, якщо після вирізання лишилось менше
 * `MIN_VISIBLE_LETTERS` літер: уламок на кшталт «Ось.» гірший за мовчання.
 * Підставити нейтральний вступ - справа `renderNumberFreeAnswer`.
 */
export function stripDigitSentences(text: string): string {
  const stripped = renumber(dropOrphans(filterLines(text)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return visibleLetters(stripped) >= MIN_VISIBLE_LETTERS ? stripped : "";
}

export interface LabeledValue {
  label: string;
  value: number;
  unit: NumberUnit;
  /** Період після одиниці: `/міс`, `/день`. */
  per: string | null;
}

const PER_RE = /^\/(?:міс|день|добу|тиждень|тиж|рік)[а-яіїєґ]*/i;

/** Розділювачі, за якими мітка точно починається заново. */
const LABEL_CUT_CHARS = ["\n", ";", "|", ">", "("];

function labelBefore(text: string, start: number): string | null {
  const window = text.slice(Math.max(0, start - 90), start);
  let from = 0;
  for (const ch of LABEL_CUT_CHARS) {
    from = Math.max(from, window.lastIndexOf(ch) + 1);
  }
  const sentenceEnd = window.search(/[.!?…]\s+[^.!?…]*$/u);
  if (sentenceEnd >= 0) {
    from = Math.max(from, sentenceEnd + 1);
  }
  let clause = window.slice(from);
  clause = clause.replace(/[\s:=,"'«»*_–—-]+$/u, "");
  const pieces = clause.split(/[,:]/u);
  const label = (pieces[pieces.length - 1] ?? "")
    .replace(/[*_"«»]/gu, "")
    .trim();
  if (label === "" || /[\d_<>]/.test(label)) return null;
  const words = label.split(/\s+/).slice(-6);
  if (!words.some((w) => w.replace(/[^\p{L}]/gu, "").length >= 2)) return null;
  const joined = words.join(" ");
  return joined.charAt(0).toLocaleUpperCase("uk-UA") + joined.slice(1);
}

/**
 * Пари «підпис: значення» з текстів, які бачила модель (результати
 * інструментів, контекст). Витягаються лише перевірювані значення: гроші й
 * їжа/вага від 100. Підпис береться з тексту перед числом; пара без
 * осмисленого підпису відкидається, а не вгадується.
 */
export function collectLabeledValues(
  texts: readonly string[],
  limit: number = MAX_EXACT_VALUES,
): LabeledValue[] {
  const seen = new Set<string>();
  const out: LabeledValue[] = [];
  for (const text of texts) {
    for (const token of extractNumberTokens(text)) {
      if (!token.scoped || token.unit === null) continue;
      const label = labelBefore(text, token.start);
      if (label === null) continue;
      const key = `${label.toLowerCase()}|${token.value}|${token.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const per = PER_RE.exec(text.slice(token.end))?.[0] ?? null;
      out.push({ label, value: token.value, unit: token.unit, per });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const UNIT_LABEL: Record<NumberUnit, string> = {
  money: "₴",
  kcal: "ккал",
  kg: "кг",
  g: "г",
};

function formatValue(item: LabeledValue): string {
  const number = formatNumberUk(item.value, { maximumFractionDigits: 2 });
  return `${number}${NNBSP}${UNIT_LABEL[item.unit]}${item.per ?? ""}`;
}

/**
 * Markdown-блок «Точні значення». Порожній рядок, якщо значень немає: заголовок
 * над порожнім списком був би ще однією неправдою.
 */
export function renderExactValuesBlock(
  values: readonly LabeledValue[],
  limit: number = MAX_EXACT_VALUES,
): string {
  const shown = values.slice(0, limit);
  if (shown.length === 0) return "";
  const rows = shown.map((v) => `- ${v.label}: ${formatValue(v)}`);
  return [`**${EXACT_VALUES_TITLE}**`, ...rows].join("\n");
}

/**
 * Підсумкова відповідь без цифр: речення з цифрами вирізано, під ними блок
 * точних значень. Якщо від тексту нічого не лишилось, його замінює нейтральний
 * вступ (інший, коли блоку теж немає).
 */
export function renderNumberFreeAnswer(
  originalText: string,
  values: readonly LabeledValue[],
): string {
  const block = renderExactValuesBlock(values);
  const body = stripDigitSentences(originalText);
  const lead =
    body !== ""
      ? body
      : block !== ""
        ? NUMBER_FREE_INTRO
        : NUMBER_FREE_INTRO_NO_VALUES;
  return block === "" ? lead : `${lead}\n\n${block}`;
}
