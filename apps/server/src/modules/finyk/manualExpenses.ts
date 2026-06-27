import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import pool from "../../db.js";
import { parseBody } from "../../http/validate.js";
import { ManualExpenseCreateSchema } from "../../http/schemas.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * `Date` → `YYYY-MM-DD` у Europe/Kyiv (домен-інваріант day boundary).
 *
 * НЕ `toISOString().slice(0,10)` — то UTC-день: понеділок 00:30 Kyiv
 * (неділя 22:30 UTC влітку) дав би «неділю» і зламав денні агрегації.
 */
function kyivDateString(input: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input);
}

/**
 * Канонічна `ManualExpense`-форма, як вона лежить у localStorage
 * (`finyk_manual_expenses_v1`) і в `data_json` рядка `finyk_manual_expenses`.
 * `amount` — у ГРИВНЯХ (major units), додатнє число; конвертацію з копійок,
 * у яких приходить API-body (Hard Rule #1), робимо нижче в `createManualExpense`.
 */
interface ManualExpenseBlob {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
}

interface ManualExpenseRow {
  id: string;
  data_json: ManualExpenseBlob | string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Серіалізатор рядка `finyk_manual_expenses` у JSON-відповідь.
 *
 * Гроші повертаємо у КОПІЙКАХ (`amountKopiykas: number`, minor units) —
 * money-інваріант (Hard Rule #1): API-межа ніколи не віддає сирий bigint і
 * не змішує одиниці. `data_json.amount` зберігається у гривнях (LS-парність),
 * тож множимо на 100 і `Math.round`-имо, щоб прибрати float-дрейф (0.1+0.2).
 */
export function serializeManualExpense(row: ManualExpenseRow): {
  id: string;
  amountKopiykas: number;
  category: string;
  date: string;
  note: string;
  createdAt: string;
  updatedAt: string;
} {
  const blob: ManualExpenseBlob =
    typeof row.data_json === "string"
      ? (JSON.parse(row.data_json) as ManualExpenseBlob)
      : row.data_json;

  return {
    id: row.id,
    amountKopiykas: Math.round(Number(blob.amount) * 100),
    category: blob.category,
    date: blob.date,
    note: blob.description,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * POST /api/v1/finyk/manual-expenses — записати ручну (не-Mono) витрату.
 *
 * Замінює клієнтський `safeWriteLS`-bypass (state-write-paths doctrine):
 * раніше manual-витрата писалась лише у localStorage, тепер вона має
 * server-side row, на який зможе перейти `chatActions` після цього PR.
 *
 * Auth: scope по `req.user.id` (Better Auth opaque string, гарантується
 * `requireSession` у роутері) — `user_id` НЕ приймається з body.
 */
export async function createManualExpense(
  req: Request,
  res: Response,
): Promise<void> {
  const { amount, category, date, note } = parseBody(
    ManualExpenseCreateSchema,
    req,
  );
  const userId = (req as WithSessionUser).user!.id;

  // Body `amount` — копійки (minor units, Hard Rule #1). Канонічний
  // `ManualExpense`-blob у LS зберігає гривні, тож конвертуємо тут, на
  // межі persistence, а не тягнемо копійки крізь увесь finyk-домен.
  const amountHryvnia = amount / 100;

  // Europe/Kyiv day boundary (домен-інваріант). Без `date` — Kyiv-«сьогодні»;
  // UTC-«сьогодні» зламав би денні агрегації на межі доби. Передану `date`
  // (вже валідну `YYYY-MM-DD` зі схеми) лишаємо як є — це календарний день,
  // який користувач явно обрав, без tz-зсуву.
  const expenseDate = date ?? kyivDateString(new Date());

  const blob: ManualExpenseBlob = {
    id: randomUUID(),
    date: expenseDate,
    description: note ?? "",
    amount: amountHryvnia,
    category,
  };

  // Сиблінг-патерн із `finyk/applySync.applyFinykPerRowBlob`: id UUID PK +
  // user_id + data_json JSONB. `RETURNING` віддає рядок назад у серіалізатор.
  const result = await pool.query<ManualExpenseRow>(
    `INSERT INTO finyk_manual_expenses (id, user_id, data_json)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, data_json, created_at, updated_at`,
    [blob.id, userId, JSON.stringify(blob)],
  );

  const created = result.rows[0];
  if (!created) {
    // INSERT ... RETURNING завжди віддає рядок при успіху; порожній результат
    // означав би драйвер-аномалію — хай впаде у 500 через error-handler.
    throw new Error("finyk_manual_expenses INSERT returned no row");
  }

  res.status(201).json({ ok: true, expense: serializeManualExpense(created) });
}
