/**
 * OpenClaw internal sub-router: AI-memory endpoints
 * (`recall`, `forget`, `forget/confirm`, `forget/cancel`).
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { asyncHandler } from "../../../http/index.js";
import { parseBody } from "../../../http/validate.js";
import {
  cancelForget,
  confirmForget,
  forgetById,
  forgetByTopic,
  forgetSince,
  previewForget,
  ForgetRateLimitError,
  ForgetTokenError,
} from "../../../modules/ai-memory/forget.js";
import { recallCofounderMemory } from "../../../modules/openclaw/index.js";
import {
  ForgetBody,
  ForgetCancelBody,
  ForgetConfirmBody,
  RecallBody,
} from "./schemas.js";

export function registerMemoryRoutes(r: Router, pool: Pool): void {
  // ---- recall_memory ----
  r.post(
    "/api/internal/openclaw/recall",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(RecallBody, req);
      const result = await recallCofounderMemory(parsed.founderUserId, {
        query: parsed.query,
        topK: parsed.topK,
      });
      res.json(result);
    }),
  );

  // ---- forget_memory (PR-23 / /forget slash) ----
  // Single mode-dispatch endpoint:
  //   byId        → soft-delete one row by ai_memories.id
  //   byTopic     → soft-delete all rows for founder × topic
  //   since       → soft-delete all rows created on/after date
  //   previewQuery → semantic search, return token+preview (no delete)
  // Rate-limited: 3 deletes/hour/founder. previewQuery NOT rate-limited.
  r.post(
    "/api/internal/openclaw/forget",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetBody, req);
      const body = parsed;
      try {
        if (body.mode === "byId") {
          const result = await forgetById(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            memoryId: body.memoryId,
          });
          res.json(result);
          return;
        }
        if (body.mode === "byTopic") {
          const result = await forgetByTopic(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            topic: body.topic,
          });
          res.json(result);
          return;
        }
        if (body.mode === "since") {
          const result = await forgetSince(pool, {
            founderUserId: body.founderUserId,
            founderTgUserId: body.founderTgUserId,
            rawCommand: body.rawCommand,
            sinceDate: body.sinceDate,
          });
          res.json(result);
          return;
        }
        // previewQuery
        const result = await previewForget({
          founderUserId: body.founderUserId,
          founderTgUserId: body.founderTgUserId,
          rawCommand: body.rawCommand,
          query: body.query,
          topK: body.topK,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof ForgetRateLimitError) {
          res.status(429).json({
            error: "rate_limited",
            message: err.message,
            retryAfterSec: err.retryAfterSec,
          });
          return;
        }
        throw err;
      }
    }),
  );

  // ---- forget_memory_confirm (PR-23 / preview confirm) ----
  r.post(
    "/api/internal/openclaw/forget/confirm",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetConfirmBody, req);
      try {
        const result = await confirmForget(pool, {
          founderUserId: parsed.founderUserId,
          founderTgUserId: parsed.founderTgUserId,
          rawCommand: parsed.rawCommand,
          token: parsed.token,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof ForgetRateLimitError) {
          res.status(429).json({
            error: "rate_limited",
            message: err.message,
            retryAfterSec: err.retryAfterSec,
          });
          return;
        }
        if (err instanceof ForgetTokenError) {
          res.status(410).json({
            error: "token_invalid",
            reason: err.reason,
            message: err.message,
          });
          return;
        }
        throw err;
      }
    }),
  );

  // ---- forget_memory_cancel (PR-23 / preview cancel) ----
  r.post(
    "/api/internal/openclaw/forget/cancel",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ForgetCancelBody, req);
      const cancelled = cancelForget(parsed.token, parsed.founderUserId);
      res.json({ cancelled });
    }),
  );
}
