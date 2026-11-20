/**
 * Зорові пайплайни фінʼїка — скан чека (`POST /api/finyk/receipts/analyze`)
 * і імпорт скриншота виписки (`POST /api/finyk/import/screenshot/analyze`).
 *
 * Обидва в проді на `OPENROUTER_RECEIPT_MODEL`; до 2026-11-19 стенда для них
 * не було взагалі (дослідження `2026-11-19-openrouter-new-models.md` § 4.4).
 *
 * Судді детерміновані: відповідь іде продовим ланцюжком
 * (`extractJsonFromText` → `normalizeVisionResult` /
 * `normalizeImportScreenshotResult`, для виписки ще
 * `salvageRowsFromTruncatedJson`), і порівнюється з істиною з
 * `visionDocs.data.ts`. Допуски:
 *
 *   * гроші (підсумок чека, суми рядків виписки) — точно до копійки;
 *   * дата — точно (`YYYY-MM-DD`);
 *   * кількість позицій чека — точно до 15 позицій, ±1 для довгого чека
 *     (34 позиції: рядок, склеєний чи розірваний на межі, не вартий провалу
 *     кейса, поки підсумок точний);
 *   * контрольна позиція — підрядок назви без регістру, сума точно (зі
 *     знижкою, згорнутою в позицію, або без неї, якщо модель винесла знижку
 *     окремим рядком — промпт дозволяє обидва), вага ±0,001 кг;
 *   * назва продавця й опис рядка виписки — ключ без регістру й апострофів,
 *     а для слова від 6 літер досить основи з перших пʼяти («Ромашка 24»
 *     замість «Ромашкова 24» — промах OCR у назві, який людина виправить
 *     одним тапом, і заради нього кейс про суми не провалюємо; гроші й дати
 *     перевіряються точно).
 *
 * Кейс-пастка (`abstain`) проходить, лише коли модель не вигадала того, чого
 * на зображенні немає.
 */

import { readFileSync } from "node:fs";

import { extractJsonFromText } from "../../src/http/jsonSafe.js";
import {
  normalizeImportScreenshotResult,
  salvageRowsFromTruncatedJson,
} from "../../src/modules/finyk/import/screenshotAnalyze.js";
import { normalizeVisionResult } from "../../src/modules/finyk/receipts/analyze.js";
import type { JudgeVerdict } from "./types.js";
import type { VisionCase } from "./visionCase.js";
import {
  CHAT_MESSAGES,
  FIXTURE_FILES,
  RECEIPTS,
  STATEMENTS,
  STATEMENT_TODAY,
  expectedStatementRows,
  lineSum,
  receiptTotal,
  type ReceiptDoc,
  type StatementDoc,
} from "./visionDocs.data.js";

const FIXTURE_DIR = new URL(
  "../../src/__fixtures__/vision-eval/",
  import.meta.url,
);

export function fixtureImage(file: string): {
  base64: string;
  mimeType: string;
} {
  const buf = readFileSync(new URL(file, FIXTURE_DIR));
  return {
    base64: buf.toString("base64"),
    mimeType: file.endsWith(".png") ? "image/png" : "image/jpeg",
  };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ʼ'’`"«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Ключ у назві: повністю або основою першого слова (див. допуски вгорі). */
function nameMatches(actual: string, key: string): boolean {
  const a = norm(actual);
  const k = norm(key);
  if (a.includes(k)) return true;
  const first = k.split(" ")[0] ?? "";
  return first.length >= 6 && a.includes(first.slice(0, 5));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ── Чеки ────────────────────────────────────────────────────────────

/** Відповідь чека прод-ланцюжком; `null` — прод-парсер не розібрав JSON. */
function receiptDraft(text: string) {
  const parsed = extractJsonFromText(text);
  if (!isRecord(parsed)) return null;
  return { raw: parsed, draft: normalizeVisionResult(parsed) };
}

function storeKey(store: string): string {
  return norm(/«(.+)»/.exec(store)?.[1] ?? store);
}

function receiptJudge(doc: ReceiptDoc): (text: string) => JudgeVerdict {
  const total = receiptTotal(doc);
  const countTolerance = doc.lines.length > 15 ? 1 : 0;
  return (text) => {
    const r = receiptDraft(text);
    if (!r) return "бите JSON: прод-парсер не розібрав";
    const { raw, draft } = r;
    const fails: string[] = [];
    if (!nameMatches(draft.store, storeKey(doc.store))) {
      fails.push(`продавець «${draft.store}»`);
    }
    if (raw["date"] !== doc.date) fails.push(`дата ${String(raw["date"])}`);
    if (draft.totalKopiykas !== total) {
      fails.push(`підсумок ${draft.totalKopiykas} ≠ ${total}`);
    }
    if (Math.abs(draft.items.length - doc.lines.length) > countTolerance) {
      fails.push(`позицій ${draft.items.length} ≠ ${doc.lines.length}`);
    }
    for (const key of doc.control) {
      const line = doc.lines.find((l) => norm(l.name).includes(norm(key)));
      if (!line) throw new Error(`контрольна позиція ${key} не в даних`);
      const item = draft.items.find((i) => norm(i.name).includes(norm(key)));
      if (!item) {
        fails.push(`немає «${key}»`);
        continue;
      }
      const okSums = [lineSum(line)];
      if (line.discount) okSums.push(Math.round(line.qty * line.price));
      if (!okSums.includes(item.sumKopiykas)) {
        fails.push(`«${key}» сума ${item.sumKopiykas} ≠ ${lineSum(line)}`);
      }
      if (line.weighted && Math.abs(item.qty - line.qty) > 0.001) {
        fails.push(`«${key}» вага ${item.qty} ≠ ${line.qty}`);
      }
    }
    return fails.length === 0 || fails.join("; ");
  };
}

function cutReceiptCase(doc: ReceiptDoc): VisionCase {
  // Повністю видно перші пʼять позицій (генератор ріже посеред шостої).
  const visibleSum = doc.lines.slice(0, 5).reduce((s, l) => s + lineSum(l), 0);
  const invented = (text: string) => {
    const r = receiptDraft(text);
    return r !== null && r.draft.totalKopiykas > 0;
  };
  return {
    name: "обрізаний знизу (підсумку не видно)",
    trap: "НЕПРАВИЛЬНО: назвати підсумок, якого на кадрі немає. Сума видимих позицій тут менша за справжню (частина позицій під обрізом), а прод кладе `total_kopiykas` у суму витрати. Правильно: `total_kopiykas` 0 за правилом промпту «підсумку не видно — не рахуй суму видимих позицій» (рішення власника 2026-11-19); інтерфейс тоді просить ввести суму.",
    user: "",
    image: fixtureImage(FIXTURE_FILES.receipt(doc.key)),
    abstain: true,
    fabricated: invented,
    judge: (text) => {
      const r = receiptDraft(text);
      if (!r) return "бите JSON: прод-парсер не розібрав";
      const t = r.draft.totalKopiykas;
      if (t === 0) return true;
      return t === visibleSum
        ? `вигадка: підсумок = сума видимих позицій (${t})`
        : `вигадка: підсумок ${t}`;
    },
  };
}

const RECEIPT_CASE_NAMES: Record<string, string> = {
  supermarket: "супермаркет: знижки, готівка і решта",
  long: "довгий чек (34 позиції)",
  weighted: "вагові товари (кг × ціна)",
  cafe: "кавʼярня, 2 позиції",
  pharmacy: "аптека",
  "photo-bad": "нахилене, розмите фото з шумом",
};

const RECEIPT_TRAPS: Record<string, string> = {
  supermarket:
    "НЕПРАВИЛЬНО: взяти «ГОТІВКА 500,00» чи «РЕШТА» за підсумок, загубити знижку або занести рядок «Знижка» окремою позитивною позицією. Правильно: підсумок до оплати 703,42 до копійки.",
  long: "НЕПРАВИЛЬНО: обірвати JSON на довгому списку (прод тоді віддає порожню чернетку) або згубити підсумок. Правильно: усі 34 позиції (±1) і точний підсумок.",
  weighted:
    "НЕПРАВИЛЬНО: записати вагу як кількість 1 або ціну за кг замість суми рядка. Правильно: дробова `qty` (кг) і сума рядка, як надруковано.",
  cafe: "НЕПРАВИЛЬНО: додати позиції, яких немає, чи сплутати ціну. Правильно: рівно дві позиції і підсумок 136,00.",
  pharmacy:
    "НЕПРАВИЛЬНО: зламатись на назвах ліків із дозуванням і № упаковки або на знижці. Правильно: чотири позиції, знижка на вітамін, точний підсумок.",
  "photo-bad":
    "НЕПРАВИЛЬНО: на нахиленому, розмитому і зернистому кадрі прочитати хибні цифри підсумку чи дату. Саме таке фото людина й робить на касі.",
};

const RECEIPT_CASES: VisionCase[] = [
  ...RECEIPTS.filter((d) => d.style !== "cut").map((doc): VisionCase => ({
    name: RECEIPT_CASE_NAMES[doc.key] ?? doc.key,
    trap: RECEIPT_TRAPS[doc.key] ?? "",
    user: "",
    image: fixtureImage(FIXTURE_FILES.receipt(doc.key)),
    judge: receiptJudge(doc),
  })),
  ...RECEIPTS.filter((d) => d.style === "cut").map(cutReceiptCase),
  {
    name: "не чек (скриншот чату)",
    trap: `НЕПРАВИЛЬНО: зібрати «чек» із сум у переписці (${CHAT_MESSAGES.length} повідомлень, числа 250, 180, 90, 340). Правильно за промптом: \`store\` "", \`items\` [], \`total_kopiykas\` 0.`,
    user: "",
    image: fixtureImage(FIXTURE_FILES.chat),
    abstain: true,
    fabricated: (text) => {
      const r = receiptDraft(text);
      return (
        r !== null && (r.draft.items.length > 0 || r.draft.totalKopiykas > 0)
      );
    },
    judge: (text) => {
      const r = receiptDraft(text);
      if (!r) return "бите JSON: прод-парсер не розібрав";
      const { items, totalKopiykas } = r.draft;
      return (
        (items.length === 0 && totalKopiykas === 0) ||
        `вигадка: ${items.length} позицій, підсумок ${totalKopiykas}`
      );
    },
  },
];

// ── Виписки ─────────────────────────────────────────────────────────

function statementDraft(text: string) {
  const parsed =
    extractJsonFromText(text) ?? salvageRowsFromTruncatedJson(text);
  if (parsed === null || parsed === undefined) return null;
  return normalizeImportScreenshotResult(parsed);
}

function statementJudge(doc: StatementDoc): (text: string) => JudgeVerdict {
  const expected = expectedStatementRows(doc);
  return (text) => {
    const draft = statementDraft(text);
    if (!draft) return "бите JSON: прод-парсер не розібрав";
    const fails: string[] = [];
    if (draft.docType !== "bank_screenshot")
      fails.push(`doc_type ${draft.docType}`);
    const pool = [...draft.rows];
    for (const exp of expected) {
      const direction = exp.amount > 0 ? "income" : "expense";
      const idx = pool.findIndex(
        (r) =>
          r.amountKopiykas === Math.abs(exp.amount) &&
          r.direction === direction,
      );
      if (idx === -1) {
        fails.push(`немає ${exp.amount} (${exp.descKey})`);
        continue;
      }
      const [row] = pool.splice(idx, 1);
      if (!row) continue;
      if (row.date !== exp.date)
        fails.push(`${exp.descKey}: дата ${row.date} ≠ ${exp.date}`);
      if (!nameMatches(row.description, exp.descKey)) {
        fails.push(`${exp.descKey}: опис «${row.description}»`);
      }
      if (Boolean(row.transferLikely) !== Boolean(exp.ownTransfer)) {
        fails.push(
          `${exp.descKey}: переказ між своїми ${row.transferLikely ? "так" : "ні"}`,
        );
      }
    }
    for (const extra of pool) {
      fails.push(
        `зайвий рядок ${extra.direction === "income" ? "+" : "−"}${extra.amountKopiykas} «${extra.description}»`,
      );
    }
    return fails.length === 0 || fails.join("; ");
  };
}

const STATEMENT_CASE_NAMES: Record<string, string> = {
  "app-light": "застосунок, світла тема",
  "app-dark":
    "застосунок, темна тема: невдала операція і дати без року через Новий рік",
  table: "таблична виписка із залишком",
  "two-currency": "дві валюти (UAH і €/$)",
  "own-transfers": "перекази між власними рахунками",
  "cut-row": "рядок, перекритий кнопкою (суми не видно)",
};

const STATEMENT_TRAPS: Record<string, string> = {
  "app-light":
    "НЕПРАВИЛЬНО: занести баланс чи «Доступно» як операцію, переплутати знак зарплати чи кешбеку, загубити «Сьогодні/Вчора». Правильно: 8 операцій, суми й напрям точно, дати від якоря 2026-11-19.",
  "app-dark":
    "НЕПРАВИЛЬНО: пропустити невдалу операцію як витрату (гроші не рухались) або поставити 2026 рік рядкам «4 січня» і «31 грудня» (майбутні дати). Правильно: невдала `failed: true`, 2026-01-04 і 2025-12-31.",
  table:
    "НЕПРАВИЛЬНО: взяти колонку «Залишок» за суму чи втратити знак. Правильно: 10 операцій, суми зі стовпця «Сума», дати з рядка.",
  "two-currency":
    "НЕПРАВИЛЬНО: занести €/$ як гривні (9,99 € → 999 копійок гривні). Правильно: валюта рядка чесно `EUR`/`USD`, сервер такі рядки відкидає, лишаються три гривневі.",
  "own-transfers":
    "НЕПРАВИЛЬНО: переписати опис так, що прод-детектор переказів між своїми його не впізнає («Поповнення «На відпустку»» → «Поповнення банки»), або впізнати переказ там, де є « від Андрія» (чужа банка). Правильно: описи як на екрані.",
  "cut-row":
    "НЕПРАВИЛЬНО: вигадати суму останнього рядка, перекритого кнопкою «Поповнити картку». Правильно: чотири видимі операції; перекритий рядок без суми або відсутній.",
};

const CUT_HIDDEN_KEYS = ["дріт", "електрон"];

const STATEMENT_CASES: VisionCase[] = [
  ...STATEMENTS.map((doc): VisionCase => ({
    name: STATEMENT_CASE_NAMES[doc.key] ?? doc.key,
    trap: STATEMENT_TRAPS[doc.key] ?? "",
    user: "",
    image: fixtureImage(FIXTURE_FILES.statement(doc.key)),
    judge: statementJudge(doc),
    ...(doc.key === "cut-row"
      ? {
          abstain: true,
          fabricated: (text: string) =>
            (statementDraft(text)?.rows ?? []).some((r) =>
              CUT_HIDDEN_KEYS.some((k) => norm(r.description).includes(k)),
            ),
        }
      : {}),
  })),
  {
    name: "не виписка (скриншот чату)",
    trap: 'НЕПРАВИЛЬНО: зібрати операції з сум у переписці («скинь 250 грн»). Правильно: `doc_type` "other", `rows` [].',
    user: "",
    image: fixtureImage(FIXTURE_FILES.chat),
    abstain: true,
    fabricated: (text) => (statementDraft(text)?.rows.length ?? 0) > 0,
    judge: (text) => {
      const d = statementDraft(text);
      if (!d) return "бите JSON: прод-парсер не розібрав";
      if (d.rows.length > 0) return `вигадка: ${d.rows.length} рядків`;
      return d.docType === "other" || `doc_type ${d.docType}`;
    },
  },
  {
    name: "чек замість виписки",
    trap: 'НЕПРАВИЛЬНО: перетворити касовий чек на операції банку (позиції як витрати). Правильно: `doc_type` "receipt", `rows` [] — інтерфейс тоді пропонує скан чека.',
    user: "",
    image: fixtureImage(FIXTURE_FILES.receipt("cafe")),
    abstain: true,
    fabricated: (text) => (statementDraft(text)?.rows.length ?? 0) > 0,
    judge: (text) => {
      const d = statementDraft(text);
      if (!d) return "бите JSON: прод-парсер не розібрав";
      if (d.rows.length > 0) return `вигадка: ${d.rows.length} рядків`;
      return d.docType === "receipt" || `doc_type ${d.docType}`;
    },
  },
];

export { RECEIPT_CASES, STATEMENT_CASES, STATEMENT_TODAY };
