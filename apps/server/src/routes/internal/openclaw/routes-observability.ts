/**
 * OpenClaw internal sub-router: budget / cost / perf / invocations /
 * ADR-0032 external metrics / whois observability endpoints.
 * Split from `routes/internal/openclaw.ts` (Hard Rule #18).
 */

import type { Router } from "express";
import type { Pool } from "pg";
import { env } from "../../../env.js";
import { asyncHandler } from "../../../http/index.js";
import { parseBody } from "../../../http/validate.js";
import {
  buildAiCostSummary,
  buildPerfSnapshot,
  checkDailyBudget,
  finalizeInvocation,
  listRecentInvocations,
  openInvocation,
  // ADR-0032: ops/marketing tools ported from Sergeant Console agents.
  getStripeMetrics,
  getSentryIssues,
  getServerStats,
  getPostHogStats,
  getGithubReleases,
  // PR /whois (debug): /openclaw whois aggregator.
  lookupWhois,
} from "../../../modules/openclaw/index.js";
import { createTelegramBotClient } from "../../../modules/telegram/index.js";
import type {
  OpenClawStatus,
  OpenClawToneMode,
  OpenClawToolCall,
} from "../../../modules/openclaw/types.js";
import {
  AiCostSummaryBody,
  BudgetBody,
  FinalizeInvocationBody,
  GithubReleasesBody,
  ListBody,
  OpenInvocationBody,
  PostHogStatsBody,
  SentryIssuesBody,
  ServerStatsBody,
  StripeMetricsBody,
  WhoisLookupBody,
} from "./schemas.js";

export function registerObservabilityRoutes(r: Router, pool: Pool): void {
  // ---- budget: pre-call check ----
  r.post(
    "/api/internal/openclaw/budget",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(BudgetBody, req);
      const result = await checkDailyBudget(
        pool,
        parsed.founderUserId,
        parsed.tzName,
      );
      res.json(result);
    }),
  );

  // ---- ai-cost-summary (`/ai_cost` slash-command backend) ----
  //
  // Realtime AI-spend rollup for founder DM. Sources:
  //   - Anthropic per-day/-week/-month — `ai_usage_daily` ledger
  //     (PR-12 #2567) у Europe/Kyiv-добу.
  //   - Voyage cumulative + top-3 endpoints — in-process Prom-counter
  //     `ai_cost_estimate_usd_total` (since process restart).
  //   - Budget envelopes — `ANTHROPIC_MONTHLY_BUDGET_USD` /
  //     `VOYAGE_MONTHLY_BUDGET_USD` env-vars (PR-13 #2590).
  //
  // Body: optional `{ trendDays?: 1..30 }` — включає per-day Anthropic
  // trend-block (для `/ai_cost <N>` UI). Без trendDays — legacy shape
  // (today/week/month).
  r.post(
    "/api/internal/openclaw/ai-cost-summary",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(AiCostSummaryBody, req);
      const summary = await buildAiCostSummary({
        pool,
        budget: {
          anthropicMonthlyBudgetUsd: env.ANTHROPIC_MONTHLY_BUDGET_USD,
          voyageMonthlyBudgetUsd: env.VOYAGE_MONTHLY_BUDGET_USD,
        },
        ...(parsed.trendDays !== undefined
          ? { trendDays: parsed.trendDays }
          : {}),
      });
      res.json(summary);
    }),
  );

  // ---- perf-snapshot (`/perf` slash-command backend) ----
  //
  // Server-side performance TLDR для founder DM (продовжує
  // observability-cluster: `/ai_cost` PR-26 #2706, `/alerts history`
  // #2715, `/openclaw status` #2709).
  //
  // Sources — in-process prom-client register:
  //   - HTTP latency p50/p95/p99 from `http_request_duration_ms`
  //     histogram, top-N routes by call count.
  //   - AI latency p95 from `ai_request_duration_ms` histogram
  //     (per-provider — anthropic / voyage / etc).
  //   - DB pool gauges (`db_pool_total/idle/waiting`).
  //   - AI memory queue depth gauge (`ai_memory_ingest_queue_depth`).
  //   - Top error routes from `http_errors_total`.
  //
  // Все cumulative since-process-restart (не 5min-rate — для того
  // потрібна Prometheus-сторона). Formatter рендерить `uptime` секцію
  // явно щоб founder-а не вводити в оману.
  //
  // Body порожній — endpoint без аргументів, founder-bound через
  // internal-API-bearer guard.
  r.post(
    "/api/internal/openclaw/perf-snapshot",
    asyncHandler(async (_req, res) => {
      const snapshot = await buildPerfSnapshot();
      res.json(snapshot);
    }),
  );

  // ---- invocations: open ----
  r.post(
    "/api/internal/openclaw/invocations/open",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(OpenInvocationBody, req);
      const id = await openInvocation(pool, parsed);
      res.json({ invocationId: id });
    }),
  );

  // ---- invocations: finalize ----
  r.post(
    "/api/internal/openclaw/invocations/finalize",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(FinalizeInvocationBody, req);
      await finalizeInvocation(pool, {
        invocationId: parsed.invocationId,
        status: parsed.status as OpenClawStatus,
        assistantResponse: parsed.assistantResponse,
        toolCalls: parsed.toolCalls as OpenClawToolCall[] | undefined,
        costUsd: parsed.costUsd,
        durationMs: parsed.durationMs,
        iterations: parsed.iterations,
        errorMessage: parsed.errorMessage,
        toneMode: parsed.toneMode as OpenClawToneMode | null | undefined,
        metadataPatch: parsed.metadataPatch,
      });
      res.json({ ok: true });
    }),
  );

  // ---- get_stripe_metrics (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/stripe",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(StripeMetricsBody, req);
      const result = await getStripeMetrics({ days: parsed.days });
      res.json(result);
    }),
  );

  // ---- get_sentry_issues (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/sentry",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(SentryIssuesBody, req);
      const result = await getSentryIssues({
        level: parsed.level,
        limit: parsed.limit,
      });
      res.json(result);
    }),
  );

  // ---- get_server_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/server",
    asyncHandler(async (req, res) => {
      parseBody(ServerStatsBody, req);
      const result = await getServerStats();
      res.json(result);
    }),
  );

  // ---- get_posthog_stats (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/metrics/posthog",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(PostHogStatsBody, req);
      const result = await getPostHogStats({ days: parsed.days });
      res.json(result);
    }),
  );

  // ---- get_github_releases (ADR-0032) ----
  r.post(
    "/api/internal/openclaw/github/releases",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(GithubReleasesBody, req);
      const result = await getGithubReleases({
        limit: parsed.limit,
        repo: parsed.repo,
      });
      res.json(result);
    }),
  );

  // ---- invocations: list (observability) ----
  r.post(
    "/api/internal/openclaw/invocations/list",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(ListBody, req);
      const result = await listRecentInvocations(
        pool,
        parsed.founderUserId,
        parsed.limit ?? 50,
      );
      res.json({ invocations: result });
    }),
  );

  // ---- whois ("/openclaw whois <tg_id|@username>" payload) ----
  //
  // Read-only aggregator. Telegram resolution через
  // `SERGEANT_ALERT_BOT_TOKEN` (той самий бот, що read-telegram-topic
  // -history-у). Якщо токен пустий — `telegramClient: null`, resolution
  // skip-ується (consumer бачить `telegramError.code = "api_error"`
  // тільки коли є client + getChat fail). Cache layer навмисно
  // відсутній — invocations rollup має бути fresh для debug-у.
  r.post(
    "/api/internal/openclaw/whois",
    asyncHandler(async (req, res) => {
      const parsed = parseBody(WhoisLookupBody, req);
      const token = env.SERGEANT_ALERT_BOT_TOKEN;
      const telegramClient = token ? createTelegramBotClient({ token }) : null;
      const result = await lookupWhois(pool, {
        founderUserId: parsed.founderUserId,
        founderTgUserId: parsed.founderTgUserId,
        ...(parsed.tgUserId !== undefined ? { tgUserId: parsed.tgUserId } : {}),
        ...(parsed.username !== undefined ? { username: parsed.username } : {}),
        ...(parsed.windowDays !== undefined
          ? { windowDays: parsed.windowDays }
          : {}),
        ...(parsed.topToolsLimit !== undefined
          ? { topToolsLimit: parsed.topToolsLimit }
          : {}),
        telegramClient,
      });
      res.json(result);
    }),
  );
}
