import type { Request, Response } from "express";
import { parseBody } from "../../../http/validate.js";
import {
  ImportScreenshotAnalyzeRequestSchema,
  ImportScreenshotAnalyzeResponseSchema,
  IMPORT_SCREENSHOT_DOC_TYPES,
} from "@sergeant/shared";
import type {
  ImportScreenshotDocType,
  ImportScreenshotDraft,
  ImportScreenshotRow,
} from "@sergeant/shared";
import { validateImageBase64 } from "../../../lib/imageMagic.js";
import { extractJsonFromText } from "../../../http/jsonSafe.js";
import { ExternalServiceError } from "../../../obs/errors.js";
import { env } from "../../../env.js";
import pool from "../../../db.js";
import { callImportScreenshotVision } from "./visionClient.js";
import { isLikelyOwnTransfer } from "./transferDetect.js";
import { markDuplicateLikely } from "./duplicateDetect.js";
import { receiptVisionViaOpenRouter } from "../receipts/visionTransport.js";
import { resolveCategoryHint } from "./categoryHint.js";

type WithSessionUser = Request & { user?: { id: string } };

const MAX_SCREENSHOT_ROWS = 200;
const DOC_TYPE_SET = new Set<string>(IMPORT_SCREENSHOT_DOC_TYPES);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Читає копійкове поле з довільного LLM-JSON — ніколи не довіряє типу
 * (той самий патерн, що `receipts/analyze.ts#toSafeIntKopiykas`). */
function toSafePositiveIntKopiykas(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
}

function isValidDayKey(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  // LLM іноді дає "9:05" замість "09:05" — зіставляємо ширшим паттерном і
  // нормалізуємо годину до 2 цифр перед фінальною валідацією, замість
  // відкидати легко відновлювану відповідь.
  const loose = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  if (!loose) return null;
  const hh = loose[1]!.padStart(2, "0");
  const candidate = `${hh}:${loose[2]}`;
  return HHMM_RE.test(candidate) ? candidate : null;
}

/**
 * Нормалізує сирий JSON від vision-LLM (snake_case, `prompts.ts` контракт)
 * у камель-кейс draft (`ImportScreenshotDraftSchema`, `@sergeant/shared`).
 * Жодне поле не приймається без перевірки типу — LLM може повернути що
 * завгодно (сміттєвий текст, урізаний JSON, чужу мову); на будь-яку
 * невідповідність — безпечний дефолт, а не throw. Дзеркалить
 * `receipts/analyze.ts#normalizeVisionResult` — draft усе одно йде через
 * обовʼязковий редагований bulk-review, тож "найкраща здогадка" тут краща
 * за 500-ку на трохи криве фото.
 *
 * `date` НЕ конвертується через `kyivWallClockToUtc` (на відміну від
 * receipts) — тут це вже кінцевий Kyiv-day-key рядок `YYYY-MM-DD`, не
 * timestamp-компонент, що потребує TZ-арифметики (спека Фази 2:
 * commit-рядок несе лише `date`, без time).
 */
export function normalizeImportScreenshotResult(
  raw: unknown,
  opts: { truncated?: boolean } = {},
): ImportScreenshotDraft {
  const obj = isRecord(raw) ? raw : {};

  const docTypeRaw = obj["doc_type"];
  const docType: ImportScreenshotDocType =
    typeof docTypeRaw === "string" && DOC_TYPE_SET.has(docTypeRaw)
      ? (docTypeRaw as ImportScreenshotDocType)
      : "other";

  const bankRaw = obj["bank"];
  const bank =
    typeof bankRaw === "string" && bankRaw.trim() ? bankRaw.trim() : null;

  const rawRows = Array.isArray(obj["rows"]) ? (obj["rows"] as unknown[]) : [];
  // Один прохід (не map+filter+re-index) навмисно: `time` читається з ТОГО
  // Ж вихідного `row`, з якого читались `date`/`amount` — indexing у
  // ПОСТ-filter масив за індексом ДО filter був баг, знайдений на
  // ревʼю цього PR (row N міг отримати `time` рядка N-k після того, як
  // k попередніх рядків відкинуло filter).
  const rows: ImportScreenshotRow[] = [];
  // Лічильники відкинутого — щоб UI міг сказати ЧОМУ порожньо, а не
  // однаковим «не вдалось розпізнати транзакції» на три різні причини
  // (див. `ImportScreenshotDroppedSchema` у @sergeant/shared).
  const dropped = { failed: 0, nonUah: 0, unreadable: 0 };
  // Кап — на ПРИДАТНІ рядки, не на вхідне вікно (ревʼю PR #818): slice до
  // фільтра дозволяв би пачці нечитабельних перших рядків виїсти бюджет і
  // викинути валідні пізніші.
  for (const r of rawRows) {
    if (rows.length >= MAX_SCREENSHOT_ROWS) break;
    const row = isRecord(r) ? r : {};
    // Невдалі операції (LLM-контракт `failed: true` — live-бенч
    // 2026-08-18: інструкція «не включай» ігнорувалась моделлю стабільно,
    // а РОЗМІТИТИ рядок вона вміє) — гроші не рухались, у драфт не йдуть.
    if (row["failed"] === true) {
      dropped.failed += 1;
      continue;
    }
    // Не-UAH рядки (той самий бенч-урок, що failed: модель ігнорує
    // «пропусти», але чесно ставить розмітку) — Фаза 2 працює лише з
    // гривнею (узгоджено з CSV-шляхом: isUahCurrencyValue). Відсутнє
    // поле трактуємо як UAH — не валимо скріни без валютних позначок.
    const currencyRaw = row["currency"];
    if (
      typeof currencyRaw === "string" &&
      currencyRaw.trim() &&
      currencyRaw.trim().toUpperCase() !== "UAH"
    ) {
      dropped.nonUah += 1;
      continue;
    }
    const date = isValidDayKey(row["date"]) ? (row["date"] as string) : null;
    const amountKopiykas = toSafePositiveIntKopiykas(row["amount_kopiykas"]);
    // Рядок без розпізнаваної дати чи додатної суми — непридатний для
    // bulk-review (не можна показати картку транзакції без цих двох
    // полів) — відкидаємо тут, а не пропускаємо биту форму на клієнта.
    if (date === null || amountKopiykas <= 0) {
      dropped.unreadable += 1;
      continue;
    }

    const direction = row["direction"] === "income" ? "income" : "expense";
    const description =
      typeof row["description"] === "string" ? row["description"].trim() : "";
    const confidenceRaw = row["confidence"];
    const confidence =
      typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
        ? Math.min(1, Math.max(0, confidenceRaw))
        : 0;

    // Скрін банкінгу не несе ні колонки категорії, ні MCC — лишається
    // третій шар `categoryHint.ts` (ключові слова опису). Той самий
    // резолвер, що й на шляху виписки, щоб «Сільпо» отримало «Продукти»
    // незалежно від того, звідки рядок приїхав.
    const categoryHint = resolveCategoryHint({ direction, description });
    rows.push({
      date,
      time: normalizeTime(row["time"]),
      amountKopiykas,
      direction,
      description,
      confidence,
      // Лише true, без false — поле опційне у схемі, відсутність = «не
      // схожий на переказ» (спільний детектор із CSV-шляхом).
      ...(isLikelyOwnTransfer(description) ? { transferLikely: true } : {}),
      ...(categoryHint ? { categoryHint } : {}),
    });
  }

  return { docType, bank, rows, dropped, truncated: opts.truncated === true };
}

/**
 * Витягує ПОВНІ обʼєкти рядків із обірваного JSON.
 *
 * WHY: коли модель уперлась у `max_tokens`, `extractJsonFromText` віддає
 * `null` — незбалансовані дужки не парсяться, і 25 успішно розпізнаних
 * рядків летять у смітник разом із 26-м недописаним. Для користувача це
 * виглядало як «не бачу транзакцій» на цілком читабельному скріні.
 * Тут ми знаходимо масив `"rows": [` і збираємо з нього кожен
 * збалансований `{...}`, ігноруючи хвіст. Часткова відповідь усе одно
 * проходить обовʼязковий bulk-review, тож ризику «тихо імпортував не те»
 * немає — рівно та сама логіка, що вже виправдовує «найкращу здогадку» в
 * `normalizeImportScreenshotResult`.
 */
export function salvageRowsFromTruncatedJson(text: string): unknown {
  const rowsKey = /"rows"\s*:\s*\[/.exec(text);
  if (!rowsKey) return null;

  const rows: unknown[] = [];
  let i = rowsKey.index + rowsKey[0].length;
  while (i < text.length) {
    const objStart = text.indexOf("{", i);
    if (objStart === -1) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let objEnd = -1;
    for (let j = objStart; j < text.length; j += 1) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          objEnd = j;
          break;
        }
      }
    }
    if (objEnd === -1) break; // недописаний хвіст — далі нічого корисного
    try {
      rows.push(JSON.parse(text.slice(objStart, objEnd + 1)));
    } catch {
      /* окремий битий рядок пропускаємо, решту лишаємо */
    }
    i = objEnd + 1;
  }

  if (rows.length === 0) return null;
  const docType = /"doc_type"\s*:\s*"([a-z_]+)"/.exec(text)?.[1];
  const bank = /"bank"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text)?.[1];
  return {
    doc_type: docType ?? "bank_screenshot",
    ...(bank ? { bank } : {}),
    rows,
  };
}

/**
 * POST /api/finyk/import/screenshot/analyze — vision-розпізнавання скріна
 * банкінгу (список транзакцій / push-повідомлення). Draft у відповідь,
 * БЕЗ запису в БД (спека § Флоу Фази 2, той самий контракт, що
 * `receipts/analyze.ts`) — commit відбувається окремим
 * `POST /api/finyk/import/commit`.
 *
 * `doc_type: 'receipt'` — НЕ помилка: відповідь підказує UI піти v1-шляхом
 * (`receipts/analyze`), окреме поле в draft, а не HTTP-помилка. `'other'` —
 * так само 200 з порожніми rows; UI сам вирішує, як показати відмову.
 *
 * Hard Rule #21: НІКОЛИ не логувати `image_base64` — ні тут, ні в
 * `visionClient.ts`/`lib/anthropic.ts` (той самий контракт, що
 * nutrition analyze-photo і `receipts/analyze.ts`).
 */
export default async function screenshotAnalyzeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user?.id;

  // Ранній guard — до валідації зображення: якщо жоден транспорт не
  // сконфігурований, 503 одразу (той самий guard, що
  // `receipts/analyze.ts`, дубльований тут навмисно — Stage 2B не редагує
  // файли Stage 2A, а спільний helper довелось би класти в receipts/, що
  // теж поза дозволеною поверхнею редагування цього PR).
  const canUseOpenRouter = receiptVisionViaOpenRouter();
  const canUseAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  if (
    env.LLM_RECEIPT_PROVIDER !== "stub" &&
    !canUseOpenRouter &&
    !canUseAnthropic
  ) {
    throw new ExternalServiceError(
      "AI-розпізнавання скрінів тимчасово недоступне. Спробуй пізніше.",
      { status: 503, code: "IMPORT_VISION_UNAVAILABLE" },
    );
  }

  const { image_base64, mime_type } = parseBody(
    ImportScreenshotAnalyzeRequestSchema,
    req,
  );
  const b64 = image_base64.trim();

  // 5MB cap + magic-byte перевірка — той самий `validateImageBase64`, що
  // nutrition analyze-photo і `receipts/analyze.ts`.
  const validation = validateImageBase64(b64, mime_type);
  if (!validation.ok) {
    const status = validation.code === "TOO_LARGE" ? 413 : 415;
    res.status(status).json({
      code: validation.code,
      detail: validation.detail,
      ...(validation.code === "MAGIC_MISMATCH"
        ? {
            declared_mime: validation.declaredMime,
            detected_mime: validation.detectedMime,
          }
        : {}),
    });
    return;
  }

  const { text, truncated } = await callImportScreenshotVision({
    base64: b64,
    mediaType: validation.mimeType,
    ...(userId ? { userId } : {}),
  });

  // Обірвана відповідь не парситься цілком — рятуємо повні рядки з хвоста
  // (`salvageRowsFromTruncatedJson`), щоб довгий скрін давав ЧАСТИНУ
  // транзакцій замість нуля.
  const parsed =
    extractJsonFromText(text) ?? salvageRowsFromTruncatedJson(text);
  const draft = normalizeImportScreenshotResult(parsed, { truncated });
  // «Сітка 2» дедуп-превʼю (duplicateDetect.ts) — головний споживач саме
  // цей шлях: повторний прогін vision на тому самому скріні дає інші
  // описи, тож тір-2 хеш його не ловить; трійка дата+сума+напрям — ловить.
  const rows =
    userId && draft.rows.length > 0
      ? await markDuplicateLikely(pool, userId, draft.rows)
      : draft.rows;

  res.status(200).json(
    ImportScreenshotAnalyzeResponseSchema.parse({
      draft: { ...draft, rows },
    }),
  );
}
