/**
 * Orchestrator для `/ritual` slash-command-у.
 *
 * Виконує full lifecycle handler-у (audit-open → endpoint-fetch → audit-
 * finalize → render-reply) як pure async function, що приймає всі
 * залежності через параметр `RitualRunnerDeps`. Це дозволяє unit-тестувати
 * lifecycle без grammy `Bot` / `Context` instance-у.
 *
 * Окремо від `handler-info-commands.ts` тримаємо щоб:
 *   1. `handler-info-commands.ts` лишався тонким shim-ом над grammy;
 *   2. усі fetch-and-audit гілки покривались Vitest-ом, не лише
 *      `parseRitualCommand` (як з `parseAlertsCommand` у sibling-file-і).
 *
 * Audit-rows пишемо у `openclaw_invocations` через ту саму pair endpoint-ів
 * (`invocations/open` + `invocations/finalize`) що й `/alerts` (PR-O5).
 * Для не-implemented mode-ів audit іде з `status: "error"` +
 * `errorMessage: "ritual_not_implemented"` щоб Datadog побачив попит на
 * weekly / monthly і ми могли пріоритизувати O3.
 *
 * Sentry breadcrumb-и емітимо на кожен trigger (issue-required by O5
 * sprint-roadmap §B). Якщо `SENTRY_DSN` не виставлений — `Sentry.addBreadcrumb`
 * no-op (див. `obs/sentry.ts`).
 */

import {
  formatRitualEndpointFailure,
  formatRitualMorningReply,
  formatRitualNotImplemented,
  parseRitualCommand,
  RITUAL_HELP_TEXT,
  type ParsedRitualCommand,
  type RitualSubcommand,
} from "./ritual-format.js";

/**
 * Сирий response від `/api/internal/openclaw/briefing/morning`. Schema
 * mirrored з `assembleMorningBriefing()` у
 * `apps/server/src/modules/openclaw/briefing/builder.ts`. Тут — мінімум,
 * щоб уникнути circular-deps між tools/openclaw та apps/server.
 */
export interface MorningBriefingResponse {
  markdown?: unknown;
  data?: unknown;
}

/**
 * Fetcher abstraction для тестів. У production injection-кою стає тонкий
 * wrapper над `postJson` з handler-constants.ts; у тестах — vi.fn().
 */
export interface RitualFetcher {
  postMorningBriefing(): Promise<{
    ok: boolean;
    status: number;
    data: MorningBriefingResponse | null;
  }>;
  openInvocation(input: {
    founderUserId: string;
    founderTgUserId: number;
    trigger: "morning_ritual" | "weekly_review" | "monthly_okr";
    userMessage: string;
    metadata: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number; invocationId: number | null }>;
  finalizeInvocation(input: {
    invocationId: number;
    status: "success" | "error";
    assistantResponse: string | null;
    errorMessage: string | null;
  }): Promise<{ ok: boolean; status: number }>;
}

/**
 * Sentry breadcrumb sink — приймає вже зрендерений breadcrumb-record. У
 * production — `Sentry.addBreadcrumb({...})`, у тестах — vi.fn().
 */
export type RitualBreadcrumbFn = (breadcrumb: {
  category: string;
  message: string;
  level: "info" | "warning" | "error";
  data?: Record<string, unknown>;
}) => void;

export interface RitualRunnerDeps {
  /** Argument-частина after `/ritual` (тобто `c.match`). */
  rawArgument: string;
  /** Better Auth opaque user-id founder-а (з env / OpenClaw config). */
  founderUserId: string;
  /** Telegram user-id founder-а (з allowlist-у, для audit-row-и). */
  founderTgUserId: number;
  /** Telegram chat-id (для metadata-аудиту). Optional. */
  telegramChatId?: number;
  /** Injection-pointable fetcher. */
  fetcher: RitualFetcher;
  /** Injection-pointable Sentry breadcrumb sink. */
  addBreadcrumb?: RitualBreadcrumbFn;
}

export interface RitualRunResult {
  /** Final reply payload, готовий до `c.reply(reply, { parse_mode: "HTML" })`. */
  reply: string;
  /** Підкоманда, яку реально виконали. */
  subcommand: RitualSubcommand;
  /** ID audit-row-и у `openclaw_invocations`. `null` коли gate-rejected. */
  invocationId: number | null;
  /** Чи зайшли у happy-path. */
  ok: boolean;
}

const TRIGGER_BY_MODE: Record<
  "morning" | "weekly" | "monthly",
  "morning_ritual" | "weekly_review" | "monthly_okr"
> = {
  morning: "morning_ritual",
  weekly: "weekly_review",
  monthly: "monthly_okr",
};

/**
 * Main entry point. Парсить input, відкриває audit-row (для виконуваних
 * mode-ів), викликає briefing endpoint (для morning), finalize-ить audit
 * row, повертає reply.
 *
 * Нікому не throw-ає — будь-який збій мапиться у audit-row з
 * `status: "error"` + reply-hint user-у. Crash-safe by design (cron WF-25
 * викликає той самий endpoint і має ту саму гарантію fail-soft-у).
 */
export async function executeRitualCommand(
  deps: RitualRunnerDeps,
): Promise<RitualRunResult> {
  const parsed = parseRitualCommand(deps.rawArgument);
  const emitBreadcrumb = deps.addBreadcrumb ?? (() => undefined);
  const userMessage = `/ritual ${parsed.rawArgument || "morning"}`.trim();

  if (parsed.subcommand === "help") {
    emitBreadcrumb({
      category: "openclaw.ritual",
      message: "ritual.help",
      level: "info",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: RITUAL_HELP_TEXT,
      subcommand: "help",
      invocationId: null,
      ok: true,
    };
  }

  if (parsed.subcommand === "unknown") {
    emitBreadcrumb({
      category: "openclaw.ritual",
      message: "ritual.unknown_mode",
      level: "warning",
      data: { rawArgument: parsed.rawArgument },
    });
    return {
      reply: `${parsed.error ?? "Невідомий режим."}\n\n${RITUAL_HELP_TEXT}`,
      subcommand: "unknown",
      invocationId: null,
      ok: false,
    };
  }

  // Звідси — morning / weekly / monthly. Audit-row відкриваємо завжди,
  // навіть для not-implemented-mode, щоб мати telemetry попиту.
  const mode: "morning" | "weekly" | "monthly" = parsed.subcommand;
  const trigger = TRIGGER_BY_MODE[mode];

  emitBreadcrumb({
    category: "openclaw.ritual",
    message: `ritual.${mode}.start`,
    level: "info",
    data: {
      mode,
      trigger,
      founderTgUserId: deps.founderTgUserId,
      telegramChatId: deps.telegramChatId ?? null,
    },
  });

  const openRes = await deps.fetcher.openInvocation({
    founderUserId: deps.founderUserId,
    founderTgUserId: deps.founderTgUserId,
    trigger,
    userMessage,
    metadata: {
      telegramChatId: deps.telegramChatId ?? null,
      slashCommand: "/ritual",
      mode,
    },
  });
  const invocationId = openRes.invocationId;

  // Weekly / monthly — поки що not implemented. Розв'язуємо як stub-error,
  // щоб Datadog побачив попит на ці modes (errorMessage="ritual_not_implemented").
  if (mode === "weekly" || mode === "monthly") {
    const reply = formatRitualNotImplemented(mode);
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "error",
        assistantResponse: reply,
        errorMessage: "ritual_not_implemented",
      });
    }
    emitBreadcrumb({
      category: "openclaw.ritual",
      message: `ritual.${mode}.not_implemented`,
      level: "warning",
      data: { mode },
    });
    return {
      reply,
      subcommand: mode,
      invocationId,
      ok: false,
    };
  }

  // Morning — happy-path: викликаємо briefing endpoint.
  const briefingRes = await deps.fetcher.postMorningBriefing();
  if (!briefingRes.ok || !briefingRes.data) {
    const reply = formatRitualEndpointFailure(briefingRes.status);
    if (invocationId != null) {
      await deps.fetcher.finalizeInvocation({
        invocationId,
        status: "error",
        assistantResponse: reply,
        errorMessage: `briefing HTTP ${briefingRes.status}`,
      });
    }
    emitBreadcrumb({
      category: "openclaw.ritual",
      message: "ritual.morning.endpoint_failed",
      level: "error",
      data: { httpStatus: briefingRes.status },
    });
    return {
      reply,
      subcommand: "morning",
      invocationId,
      ok: false,
    };
  }

  const reply = formatRitualMorningReply(briefingRes.data);
  if (invocationId != null) {
    await deps.fetcher.finalizeInvocation({
      invocationId,
      status: "success",
      assistantResponse: reply,
      errorMessage: null,
    });
  }
  emitBreadcrumb({
    category: "openclaw.ritual",
    message: "ritual.morning.success",
    level: "info",
    data: { replyChars: reply.length },
  });
  return {
    reply,
    subcommand: "morning",
    invocationId,
    ok: true,
  };
}

export type { ParsedRitualCommand };
