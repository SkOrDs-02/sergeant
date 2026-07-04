/**
 * OpenClaw internal sub-router: briefing / ritual assemblers
 * (`briefing/morning`, `ritual/weekly`, `ritual/monthly`).
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../../http/index.js";
import { parseBody } from "../../../http/validate.js";
import {
  // PR-26: morning briefing template assembly (no-LLM hardcoded sections).
  assembleMorningBriefing,
  // O3 (Phase 2.B): Friday weekly + monthly OKR rituals.
  assembleWeeklyReview,
  assembleMonthlyOkrReview,
  isFounderMuted,
} from "../../../modules/openclaw/index.js";
import {
  MonthlyOkrReviewBody,
  MorningBriefingBody,
  WeeklyReviewBody,
} from "./schemas.js";

export function registerRitualsRoutes(r: Router, pool: Pool): void {
  // ---- morning briefing assembler (PR-26, no LLM) ----
  //
  // POST /api/internal/openclaw/briefing/morning → { markdown, data }.
  // Caller-и:
  //   - OpenClaw morning-cron (ops/openclaw/provision-cron.mjs) — замінює
  //     placeholder-payload своїм запитом + пушить markdown у founder-DM.
  //   - Manual probe з /digest day shortcut (future wiring).
  // Жодних side-ефектів — endpoint лиш збирає + рендерить. Fail-soft на
  // кожну джерельну функцію (див. builder.ts → mapXxx-секції).
  r.post(
    "/api/internal/openclaw/briefing/morning",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MorningBriefingBody, req);
      const input: Parameters<typeof assembleMorningBriefing>[0] = {};
      if (parsed.windowDays !== undefined) input.windowDays = parsed.windowDays;
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.sentryLimit !== undefined)
        input.sentryLimit = parsed.sentryLimit;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      if (parsed.includeProposals !== undefined)
        input.includeProposals = parsed.includeProposals;
      const result = await assembleMorningBriefing(input);
      // PR /mute (Phase 5b): augment response з mute-state коли caller
      // передав founderUserId. n8n WF-25 cron консумер читає `mute.muted`
      // і short-circuit-ує `sendMessage`. Briefing markdown усе одно
      // зберігається (cost-free аудит).
      if (parsed.founderUserId) {
        const mute = await isFounderMuted(pool, {
          founderUserId: parsed.founderUserId,
        });
        res.json({ ...result, mute });
        return;
      }
      res.json(result);
    }),
  );

  // ---- O3 (Phase 2.B): Friday weekly review ritual ----
  //
  // POST /api/internal/openclaw/ritual/weekly → { markdown, data }.
  // Викликає n8n WF-26 (cron `0 18 * * FRI Europe/Kyiv`) — після
  // отримання markdown WF постить його у founder-DM. Fail-soft: будь-яка
  // джерельна subsystem (GitHub / Stripe / PostHog / Sentry / LLM) недо-
  // ступна → секція з `notConfigured` або `note`, але endpoint все одно
  // повертає 200 з частковими даними. LLM narrative — через `LLMProvider`
  // абстракцію (PR-23) з StubProvider fallback (PR-25 паттерн).
  r.post(
    "/api/internal/openclaw/ritual/weekly",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(WeeklyReviewBody, req);
      const input: Parameters<typeof assembleWeeklyReview>[0] = {};
      if (parsed.windowDays !== undefined) input.windowDays = parsed.windowDays;
      if (parsed.staleDays !== undefined) input.staleDays = parsed.staleDays;
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.sentryLimit !== undefined)
        input.sentryLimit = parsed.sentryLimit;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      const result = await assembleWeeklyReview(input);
      res.json(result);
    }),
  );

  // ---- O3 (Phase 2.B): Monthly OKR review ritual ----
  //
  // POST /api/internal/openclaw/ritual/monthly → { markdown, data }.
  // Викликає n8n WF-27 (cron `0 9 1 * *` Europe/Kyiv) — 1-го числа місяця
  // о 09:00 Kyiv. OKR-список читається з `INTERIM_OKRS` (hardcoded, поки
  // PR-34 strategic_goals DB-table не merged). Wins/risks збираються з
  // GitHub + Sentry. Narrative — LLM з template fallback.
  r.post(
    "/api/internal/openclaw/ritual/monthly",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(MonthlyOkrReviewBody, req);
      const input: Parameters<typeof assembleMonthlyOkrReview>[0] = {};
      if (parsed.githubRepo !== undefined) input.githubRepo = parsed.githubRepo;
      if (parsed.prLimit !== undefined) input.prLimit = parsed.prLimit;
      if (parsed.staleDays !== undefined) input.staleDays = parsed.staleDays;
      if (parsed.sentryLevel !== undefined)
        input.sentryLevel = parsed.sentryLevel;
      const result = await assembleMonthlyOkrReview(input);
      res.json(result);
    }),
  );
}
