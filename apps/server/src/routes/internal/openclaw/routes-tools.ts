/**
 * OpenClaw internal sub-router: core read tools (`strategy`, `query`,
 * `github`, `workflow`, `telegram`, `decision`, `decisions/list`,
 * `classify`) + code-understanding read tools (PR-C1b: `github/search`,
 * `github/tree`, `github/diff`, `github/prs`) + SEO env-stub tools
 * (PR-C1b: `seo/gsc`, `seo/lighthouse`, `seo/serp`).
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../../env.js";
import { asyncHandler } from "../../../http/index.js";
import { parseBody } from "../../../http/validate.js";
import {
  listRecentDecisions,
  queryAppDb,
  readGithub,
  readStrategyDoc,
  readTelegramTopicHistory,
  readWorkflowLogs,
  recordDecision,
  OpenClawAllowlistError,
  OpenClawSchemaError,
  OpenClawNotFoundError,
  // PR-Stage4c: Layer 1 cheap-router (Haiku JSON classifier).
  classifyMessage,
  // PR-C1b: code-understanding tools.
  githubSearch,
  githubTree,
  githubDiff,
  githubPrs,
  // PR-C1b: SEO env-stub tools.
  seoGscQuery,
  seoPsiAudit,
  seoSerpLookup,
} from "../../../modules/openclaw/index.js";
import { asAllowlistFailure, asNotFound, asSchemaFailure } from "./helpers.js";
import {
  ClassifyBody,
  DecisionBody,
  GithubBody,
  GithubDiffBody,
  GithubPrsBody,
  GithubSearchBody,
  GithubTreeBody,
  ListBody,
  QueryBody,
  SeoGscQueryBody,
  SeoPsiAuditBody,
  SeoSerpLookupBody,
  StrategyBody,
  TelegramBody,
  WorkflowBody,
} from "./schemas.js";

export function registerToolsRoutes(r: Router, pool: Pool): void {
  // ---- read_strategy_docs ----
  r.post(
    "/api/internal/openclaw/strategy",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(StrategyBody, req);
      try {
        const result = await readStrategyDoc({ path: parsed.path });
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        if (err instanceof OpenClawNotFoundError) {
          return asNotFound(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- query_app_db ----
  r.post(
    "/api/internal/openclaw/query",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(QueryBody, req);
      try {
        const result = await queryAppDb(pool, {
          sql: parsed.sql,
          params: parsed.params,
          limit: parsed.limit,
        });
        res.json(result);
      } catch (err) {
        if (err instanceof OpenClawAllowlistError) {
          return asAllowlistFailure(res, err);
        }
        if (err instanceof OpenClawSchemaError) {
          return asSchemaFailure(res, err);
        }
        throw err;
      }
    }),
  );

  // ---- read_github ----
  r.post(
    "/api/internal/openclaw/github",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubBody, req);
      try {
        const result = await readGithub({
          repo: parsed.repo,
          mode: parsed.mode,
          filePath: parsed.filePath,
          ref: parsed.ref,
          number: parsed.number,
        });
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- read_workflow_logs ----
  r.post(
    "/api/internal/openclaw/workflow",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(WorkflowBody, req);
      try {
        const result = await readWorkflowLogs(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "workflow_error", message });
      }
    }),
  );

  // ---- read_telegram_topic_history ----
  r.post(
    "/api/internal/openclaw/telegram",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(TelegramBody, req);
      const result = await readTelegramTopicHistory(pool, parsed);
      res.json(result);
    }),
  );

  // ---- record_decision ----
  r.post(
    "/api/internal/openclaw/decision",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(DecisionBody, req);
      const result = await recordDecision(pool, parsed);
      res.json(result);
    }),
  );

  // ---- decisions: list ----
  r.post(
    "/api/internal/openclaw/decisions/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ListBody, req);
      const result = await listRecentDecisions(
        pool,
        parsed.founderUserId,
        parsed.limit ?? 20,
      );
      res.json({ decisions: result });
    }),
  );

  // ---- classify (Stage 4c — Layer 1 Haiku JSON classifier) ----
  // Один короткий Haiku-call (~$0.0002) повертає `{ class, shortcut?, persona?,
  // params?, chat_response? }`. Plugin (`hooks/cheap-router.ts`) маршрутизує:
  // routine_* → Layer 0 shortcut, chat → reply verbatim, thinking → Layer 2.
  // 503 якщо ANTHROPIC_API_KEY відсутній (deploy-config bug, не runtime);
  // 502 якщо Haiku фейлить — caller fail-closes до Layer 2 (env env_invoked).
  r.post(
    "/api/internal/openclaw/classify",
    asyncHandler(async (req, res) => {
      const apiKey = env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Не світимо назву env-змінної клієнту: вона потрапляє у formatApiError
        // і показується юзеру дослівно. Дискримінатор для frontend — `code`.
        res.status(503).json({
          error: "AI-помічник тимчасово недоступний. Спробуй пізніше.",
          code: "ANTHROPIC_KEY_MISSING",
        });
        return;
      }
      const parsed = parseBody(ClassifyBody, req);
      try {
        const classification = await classifyMessage(
          {
            userMessage: parsed.userMessage,
            ...(parsed.systemPrompt
              ? { systemPrompt: parsed.systemPrompt }
              : {}),
          },
          apiKey,
        );
        res.json(classification);
      } catch {
        // Не leak-аємо Anthropic error message клієнту — plugin
        // лише знає, що classifier недоступний, і escalates до Layer 2.
        res.status(502).json({ error: "classify_upstream_error" });
      }
    }),
  );

  // ─── PR-C1b: code-understanding read tools ────────────────────────────

  // ---- github_search ----
  r.post(
    "/api/internal/openclaw/github/search",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubSearchBody, req);
      try {
        const result = await githubSearch(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_tree ----
  r.post(
    "/api/internal/openclaw/github/tree",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubTreeBody, req);
      try {
        const result = await githubTree(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_diff ----
  r.post(
    "/api/internal/openclaw/github/diff",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubDiffBody, req);
      try {
        const result = await githubDiff(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ---- github_prs ----
  r.post(
    "/api/internal/openclaw/github/prs",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubPrsBody, req);
      try {
        const result = await githubPrs(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "github_error", message });
      }
    }),
  );

  // ─── PR-C1b: SEO env-stub tools ─────────────────────────────────────

  // ---- seo_gsc_query ----
  r.post(
    "/api/internal/openclaw/seo/gsc",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoGscQueryBody, req);
      try {
        const result = await seoGscQuery(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );

  // ---- seo_psi_audit ----
  r.post(
    "/api/internal/openclaw/seo/lighthouse",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoPsiAuditBody, req);
      try {
        const result = await seoPsiAudit(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );

  // ---- seo_serp_lookup ----
  r.post(
    "/api/internal/openclaw/seo/serp",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SeoSerpLookupBody, req);
      try {
        const result = await seoSerpLookup(parsed);
        res.json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.status(400).json({ error: "seo_error", message });
      }
    }),
  );
}
