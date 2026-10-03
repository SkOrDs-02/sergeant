import { Router } from "express";
import type { Pool } from "pg";
/**
 * `GET /api/internal/users/cohort?days=N` — повертає список користувачів,
 * які зареєструвались рівно `N` днів тому (за датою в Europe/Kyiv). Використовується
 * drip-кампаніями (WF-80) для D1/D7/D30 розсилок.
 *
 * Better Auth використовує таблицю `"user"` (не `users`) з кемел-кейс
 * колонками `"createdAt"`, `"updatedAt"`. Назви залишаємо в лапках, щоб
 * не залежати від `lower-case folding`.
 *
 * Hard Rule #1: id у Better Auth — TEXT, тому BigInt-coerce не потрібен.
 */
export function createUsersInternalRouter({ pool }: { pool: Pool }): Router {
  const r = Router();

  r.get("/api/internal/users/cohort", async (req, res) => {
    const daysRaw = Number(req.query["days"]);
    if (!Number.isInteger(daysRaw) || daysRaw < 0 || daysRaw > 365) {
      res
        .status(400)
        .json({ error: "days must be a non-negative integer <= 365" });
      return;
    }
    const days = daysRaw;
    const limit = Math.min(
      500,
      Math.max(1, Math.trunc(Number(req.query["limit"]) || 200)),
    );

    const { rows } = await pool.query<{
      id: string;
      email: string;
      name: string;
      createdAt: string;
    }>(
      `SELECT id, email, name, "createdAt"
           FROM "user"
          WHERE ("createdAt" AT TIME ZONE 'Europe/Kyiv')::date = ((now() AT TIME ZONE 'Europe/Kyiv')::date - $1::int)
          ORDER BY "createdAt" ASC
          LIMIT $2`,
      [days, limit],
    );

    res.json({
      days,
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.createdAt,
      })),
    });
  });

  return r;
}
