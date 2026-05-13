/**
 * `/api/internal/strategic/*` — PR-34 strategic mode skeleton.
 *
 * Endpoint architecture:
 *
 *   n8n WF-26 (Mon 09:00 Kyiv cron)
 *     └─ POST /api/internal/strategic/weekly-checkin
 *          body: { persona, founderUserId, weekStart }
 *          action: append-only INSERT placeholder goal (status='active')
 *          (PR-35+ заміниnt placeholder на real conversation kick-off)
 *
 *   UI / scripts (seeder, manual add-goal form)
 *     └─ POST /api/internal/strategic/goals          → create
 *     └─ POST /api/internal/strategic/goals/list     → list-for-week
 *     └─ POST /api/internal/strategic/goals/status   → update-status
 *
 * Auth: bearer-token guard у `routes/internal/index.ts` (`INTERNAL_API_KEY`).
 * Чому окремий internal-namespace, а не public-route: machine-to-machine
 * виклики від n8n; кінцеві користувачі НЕ ходять сюди напряму — UI
 * викликає через `/api/strategic/*` proxy (поки що не існує, PR-35+).
 *
 * Усі hand-off-и до помічника `apps/server/src/lib/strategicGoals.ts` —
 * fail-open: помилки повертаються як `{ ok: false, error }` без 5xx,
 * щоб n8n не падало в alert-cascade на тимчасову DB-недоступність.
 */

import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { asyncHandler } from "../../http/index.js";
import { validateBody } from "../../http/validate.js";
import {
  carryGoalToNextWeek,
  createGoal,
  getGoalById,
  listGoals,
  listGoalsForWeek,
  STRATEGIC_GOAL_PERSONAS,
  STRATEGIC_GOAL_STATUSES,
  updateGoalStatus,
} from "../../lib/strategicGoals.js";

const PersonaSchema = z.enum(STRATEGIC_GOAL_PERSONAS);
const StatusSchema = z.enum(STRATEGIC_GOAL_STATUSES);
const WeekStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "weekStart must be YYYY-MM-DD (ISO 8601 date)",
});
const FounderUserIdSchema = z.string().min(1).max(256);

const WeeklyCheckinBody = z
  .object({
    persona: PersonaSchema,
    founderUserId: FounderUserIdSchema,
    weekStart: WeekStartSchema,
    /** Опційний placeholder text; default — strategic-skeleton marker. */
    goalText: z.string().min(1).max(2048).optional(),
  })
  .strict();

const CreateGoalBody = z
  .object({
    persona: PersonaSchema,
    founderUserId: FounderUserIdSchema,
    weekStart: WeekStartSchema,
    goalText: z.string().min(1).max(2048),
    status: StatusSchema.optional(),
  })
  .strict();

const ListGoalsBody = z
  .object({
    weekStart: WeekStartSchema,
    persona: PersonaSchema.optional(),
    founderUserId: FounderUserIdSchema.optional(),
    status: StatusSchema.optional(),
  })
  .strict();

const ListBody = z
  .object({
    founderUserId: FounderUserIdSchema.optional(),
    persona: PersonaSchema.optional(),
    status: StatusSchema.optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

const UpdateStatusBody = z
  .object({
    id: z.number().int().positive(),
    status: StatusSchema,
  })
  .strict();

const CarryGoalBody = z
  .object({
    id: z.number().int().positive(),
  })
  .strict();

export function createStrategicInternalRouter({
  pool,
}: {
  pool: Pool;
}): Router {
  const r = Router();

  /**
   * WF-26 weekly cron entry-point. INSERT-ить placeholder goal для
   * `(persona, founderUserId, weekStart)` — це маркер «strategic week
   * kicked off». PR-35+ замінить placeholder на real conversation flow.
   */
  r.post(
    "/api/internal/strategic/weekly-checkin",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(WeeklyCheckinBody, req, res);
      if (!parsed.ok) return;
      const goalText =
        parsed.data.goalText ?? "Weekly strategic kickoff (placeholder)";
      const created = await createGoal(pool, {
        persona: parsed.data.persona,
        founderUserId: parsed.data.founderUserId,
        weekStart: parsed.data.weekStart,
        goalText,
      });
      if (created === null) {
        res.status(200).json({ ok: false, error: "create_failed" });
        return;
      }
      res.json({ ok: true, goal: created });
    }),
  );

  r.post(
    "/api/internal/strategic/goals",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(CreateGoalBody, req, res);
      if (!parsed.ok) return;
      const created = await createGoal(pool, {
        persona: parsed.data.persona,
        founderUserId: parsed.data.founderUserId,
        weekStart: parsed.data.weekStart,
        goalText: parsed.data.goalText,
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
      });
      if (created === null) {
        res.status(200).json({ ok: false, error: "create_failed" });
        return;
      }
      res.json({ ok: true, goal: created });
    }),
  );

  r.post(
    "/api/internal/strategic/goals/list",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ListGoalsBody, req, res);
      if (!parsed.ok) return;
      const goals = await listGoalsForWeek(pool, {
        weekStart: parsed.data.weekStart,
        ...(parsed.data.persona !== undefined
          ? { persona: parsed.data.persona }
          : {}),
        ...(parsed.data.founderUserId !== undefined
          ? { founderUserId: parsed.data.founderUserId }
          : {}),
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
      });
      res.json({ ok: true, goals });
    }),
  );

  /**
   * `/strategy list` Telegram-команда — листить goals founder-а через всі
   * тижні з опційним status- / persona-фільтром. Окремий route від
   * `/goals/list`, бо там обов'язковий `weekStart`. Hard-cap 200 рядків.
   */
  r.post(
    "/api/internal/strategic/list",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(ListBody, req, res);
      if (!parsed.ok) return;
      const goals = await listGoals(pool, {
        ...(parsed.data.founderUserId !== undefined
          ? { founderUserId: parsed.data.founderUserId }
          : {}),
        ...(parsed.data.persona !== undefined
          ? { persona: parsed.data.persona }
          : {}),
        ...(parsed.data.status !== undefined
          ? { status: parsed.data.status }
          : {}),
        ...(parsed.data.limit !== undefined
          ? { limit: parsed.data.limit }
          : {}),
      });
      res.json({ ok: true, goals });
    }),
  );

  /**
   * `GET /api/internal/strategic/goals/:id` — single-goal lookup для
   * `/strategy`-команди (UI feedback з persona + поточним status-ом).
   * Fail-open: `{ ok: false, error: 'not_found' }` (status 200) якщо
   * goal не існує — Telegram-handler рендерить err-меседж.
   */
  r.post(
    "/api/internal/strategic/goal",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(CarryGoalBody, req, res);
      if (!parsed.ok) return;
      const goal = await getGoalById(pool, parsed.data.id);
      if (goal === null) {
        res.status(200).json({ ok: false, error: "not_found" });
        return;
      }
      res.json({ ok: true, goal });
    }),
  );

  r.post(
    "/api/internal/strategic/goals/status",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(UpdateStatusBody, req, res);
      if (!parsed.ok) return;
      const updated = await updateGoalStatus(
        pool,
        parsed.data.id,
        parsed.data.status,
      );
      if (updated === null) {
        res.status(200).json({ ok: false, error: "update_failed" });
        return;
      }
      res.json({ ok: true, goal: updated });
    }),
  );

  /**
   * `/strategy carry <id>` — atomic UPDATE: `week_start += 7d, status =
   * 'carried_over'`. Зберігає persistent ID-посилання для уже-існуючих
   * audit / history-рефернсів (на відміну від INSERT-нового-рядка).
   * Fail-open: `null` → `{ ok: false }`.
   */
  r.post(
    "/api/internal/strategic/goals/carry",
    asyncHandler(async (req, res) => {
      const parsed = validateBody(CarryGoalBody, req, res);
      if (!parsed.ok) return;
      const carried = await carryGoalToNextWeek(pool, parsed.data.id);
      if (carried === null) {
        res.status(200).json({ ok: false, error: "carry_failed" });
        return;
      }
      res.json({ ok: true, goal: carried });
    }),
  );

  return r;
}
