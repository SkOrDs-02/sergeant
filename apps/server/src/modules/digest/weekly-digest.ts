import type { Request, Response } from "express";
import { validateBody } from "../../http/validate.js";
import {
  WeeklyDigestSchema,
  WeeklyDigestReportSchema,
  WeeklyDigestSuccessSchema,
  type WeeklyDigestReport,
  type WeeklyDigestRequest,
} from "../../http/schemas.js";
import { ExternalServiceError, ValidationError } from "../../obs/errors.js";
import { env } from "../../env.js";
import {
  getLLMProvider,
  invokeLLM,
  type LLMBreadcrumbFn,
  type LLMProvider,
} from "../../lib/llm/provider.js";
import { logger } from "../../obs/logger.js";
import { enqueueMemoryIngest } from "../ai-memory/ingestQueue.js";

type WithAnthropicKey = Request & { anthropicKey?: string };
type WithSessionUser = Request & { user?: { id: string } };

/**
 * Витягує всі непорожні summary/comment-секції з структурованого digest-у і
 * зливає у one-line memory-string. Воєйдж-embedding краще працює з
 * самодостатнім текстом ("За тиждень X-Y юзер витратив 1200 ₴..."), ніж з
 * JSON-дампом, тому формуємо людську форму.
 */
function buildDigestMemoryContent(
  weekRange: string | undefined,
  report: unknown,
): string {
  const safe = (report ?? {}) as Record<string, unknown>;
  const sections: string[] = [];
  const tag = weekRange ? `Тижневий звіт ${weekRange}` : "Тижневий звіт";
  for (const key of ["finyk", "fizruk", "nutrition", "routine"] as const) {
    const sec = safe[key] as
      | { summary?: string; comment?: string }
      | null
      | undefined;
    if (!sec) continue;
    const summary = (sec.summary || "").trim();
    const comment = (sec.comment || "").trim();
    const piece = [summary, comment].filter(Boolean).join(" ");
    if (piece) sections.push(`${key}: ${piece}`);
  }
  const overall = Array.isArray(safe["overallRecommendations"])
    ? (safe["overallRecommendations"] as unknown[])
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .join("; ")
    : "";
  if (overall) sections.push(`overall: ${overall}`);
  const joined = sections.join(" | ");
  // Cap-имо до AI_MEMORY_INGEST_MAX_CONTENT_LEN — длинна digest-секцій
  // непередбачувана (Claude може вискочити за середній обʼєм).
  const cap = env.AI_MEMORY_INGEST_MAX_CONTENT_LEN;
  return `${tag}. ${joined}`.slice(0, cap);
}

function extractJsonObject(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  // Прибираємо markdown-обгортку ```json ... ``` або ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1]!.trim();

  const start = text.indexOf("{");
  if (start < 0) return null;

  // Знаходимо відповідну закриваючу дужку з урахуванням рядків та екранування.
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = text.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  // Жорсткий fallback: спробувати розпарсити «as is»
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

/**
 * PR-25: build template-based digest report з raw метрик (без LLM).
 * Використовується (а) як stub-response для `StubProvider`, і (б) як
 * автоматичний fallback коли Anthropic !ok і `LLM_DIGEST_FALLBACK_ON_ERROR=true`.
 *
 * Це не повноцінний AI-аналіз: лише числа й одна summary-строка на секцію,
 * без `comment`-розгортки і без `recommendations` (як просив PR-плану — "PostHog
 * raw metrics ... без рекомендацій"). Краще, ніж порожній звіт або 502, коли
 * Anthropic у incident-і.
 */
export function buildTemplateReport(
  data: WeeklyDigestRequest,
): WeeklyDigestReport {
  const { finyk, fizruk, nutrition, routine } = data;
  return {
    finyk: finyk
      ? {
          summary: `Витрати ${finyk.totalSpent ?? 0} грн, надходження ${finyk.totalIncome ?? 0} грн, ${finyk.txCount ?? 0} транзакцій.`,
          comment:
            "Шаблонний звіт без AI-аналізу (Anthropic недоступний або вимкнено). Числа взяті напряму з тижневих даних — інтерпретація буде доступна, коли AI-сервіс відновиться.",
          recommendations: [],
        }
      : null,
    fizruk: fizruk
      ? {
          summary: `${fizruk.workoutsCount ?? 0} тренувань, обсяг ${fizruk.totalVolume ?? 0} кг${
            fizruk.recoveryLabel ? `, стан: ${fizruk.recoveryLabel}` : ""
          }.`,
          comment:
            "Шаблонний звіт без AI-аналізу. Покажемо детальний коментар, коли AI-сервіс відновиться.",
          recommendations: [],
        }
      : null,
    nutrition: nutrition
      ? {
          summary: `Середньодобово ${nutrition.avgKcal ?? 0} ккал з ${nutrition.daysLogged ?? 0}/7 днів записів.`,
          comment:
            "Шаблонний звіт без AI-аналізу. Деталі (макроси, тенденції) з'являться після відновлення AI-сервісу.",
          recommendations: [],
        }
      : null,
    routine: routine
      ? {
          summary: `${routine.habitCount ?? 0} звичок, загальний відсоток ${routine.overallRate ?? 0}%.`,
          comment:
            "Шаблонний звіт без AI-аналізу. Розширений аналіз стане доступним після відновлення AI-сервісу.",
          recommendations: [],
        }
      : null,
    overallRecommendations: [],
  };
}

/**
 * Тонкий DI-shim — дозволяє тестам інжектити `LLMProvider` + `addBreadcrumb`
 * + перевизначати `fallbackOnError` без mock-у модулів. Production-route
 * `apps/server/src/routes/weekly-digest.ts` використовує default-export
 * (no options → читаються з env).
 */
export interface WeeklyDigestHandlerOptions {
  provider?: LLMProvider;
  addBreadcrumb?: LLMBreadcrumbFn;
  /**
   * Override `env.LLM_DIGEST_FALLBACK_ON_ERROR` для одного instance handler-а.
   * Корисно у тестах і у scoped deployments (e.g. e2e з `false`).
   */
  fallbackOnError?: boolean;
}

/**
 * POST /api/weekly-digest — згенерувати тижневий звіт. CORS/method/key/quota
 * забезпечені middleware-ами роутера; тут лише бізнес-логіка. Ключ Anthropic
 * читається з `req.anthropicKey`.
 */
export function createWeeklyDigestHandler(
  options: WeeklyDigestHandlerOptions = {},
): (req: Request, res: Response) => Promise<void> {
  return async function handler(req: Request, res: Response): Promise<void> {
    const apiKey = (req as WithAnthropicKey).anthropicKey as string;

    const parsed = validateBody(WeeklyDigestSchema, req, res);
    if (!parsed.ok) return;
    const { weekRange, finyk, fizruk, nutrition, routine } = parsed.data;

    const sections: string[] = [];

    if (finyk) {
      const budgetLine = finyk.monthlyBudget
        ? `Місячний бюджет: ${finyk.monthlyBudget} грн`
        : "Місячний бюджет: не встановлено";
      const topCats =
        Array.isArray(finyk.topCategories) && finyk.topCategories.length
          ? finyk.topCategories
              .map((c) => `  - ${c.name}: ${c.amount} грн`)
              .join("\n")
          : "  Немає даних";
      sections.push(`[ФІНАНСИ (${weekRange || "тиждень"})]
Витрати: ${finyk.totalSpent ?? 0} грн | Надходження: ${finyk.totalIncome ?? 0} грн
${budgetLine}
Топ категорії витрат:
${topCats}
Транзакцій: ${finyk.txCount ?? 0}`);
    }

    if (fizruk) {
      const exercises =
        Array.isArray(fizruk.topExercises) && fizruk.topExercises.length
          ? fizruk.topExercises
              .map((e) => `  - ${e.name}: ${e.totalVolume} кг`)
              .join("\n")
          : "  Немає даних";
      sections.push(`[ТРЕНУВАННЯ (${weekRange || "тиждень"})]
Тренувань завершено: ${fizruk.workoutsCount ?? 0}
Загальний об'єм: ${fizruk.totalVolume ?? 0} кг
Стан відновлення: ${fizruk.recoveryLabel ?? "Немає даних"}
Топ вправи:
${exercises}`);
    }

    if (nutrition) {
      const deficit = (nutrition.targetKcal ?? 0) - (nutrition.avgKcal ?? 0);
      const balance =
        deficit > 50
          ? `дефіцит ${Math.round(deficit)} ккал`
          : deficit < -50
            ? `профіцит ${Math.round(Math.abs(deficit))} ккал`
            : "баланс";
      sections.push(`[ХАРЧУВАННЯ (${weekRange || "тиждень"})]
Середньодобово: ${nutrition.avgKcal ?? 0} ккал (ціль ${nutrition.targetKcal ?? 2000} ккал, ${balance})
Середній БЖВ: Б ${nutrition.avgProtein ?? 0}г / Ж ${nutrition.avgFat ?? 0}г / В ${nutrition.avgCarbs ?? 0}г
Днів із записами: ${nutrition.daysLogged ?? 0} з 7`);
    }

    if (routine) {
      const habitsInfo =
        Array.isArray(routine.habits) && routine.habits.length
          ? routine.habits
              .map(
                (h) =>
                  `  - ${h.name}: ${h.completionRate}% (${h.done}/${h.total} днів)`,
              )
              .join("\n")
          : "  Немає активних звичок";
      sections.push(`[ЗВИЧКИ (${weekRange || "тиждень"})]
Загальний відсоток: ${routine.overallRate ?? 0}%
Активних звичок: ${routine.habitCount ?? 0}
По звичках:
${habitsInfo}`);
    }

    if (!sections.length) {
      throw new ValidationError("Немає даних для генерації звіту");
    }

    const dataContext = sections.join("\n\n");
    const userPrompt = `Проаналізуй тижневі дані юзера і поверни ТІЛЬКИ валідний JSON (без markdown-обгортки, без \`\`\`json) такого вигляду:
{
  "finyk": {
    "summary": "1 речення: що відбулося з фінансами",
    "comment": "2-3 речення: аналіз витрат, тенденції",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "fizruk": {
    "summary": "1 речення: підсумок тренувань",
    "comment": "2-3 речення: аналіз об'єму, відновлення",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "nutrition": {
    "summary": "1 речення: підсумок харчування",
    "comment": "2-3 речення: аналіз калоражу, макросів",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "routine": {
    "summary": "1 речення: підсумок звичок",
    "comment": "2-3 речення: аналіз виконання",
    "recommendations": ["рекомендація 1", "рекомендація 2"]
  },
  "overallRecommendations": ["загальна рекомендація 1", "загальна рекомендація 2"]
}
Якщо даних по модулю немає — поверни null для цього ключа. Відповідай ВИКЛЮЧНО валідним JSON.`;

    const systemPrompt = `Ти аналітик персональних даних користувача додатку "Мій простір".
Відповідай ВИКЛЮЧНО валідним JSON — без markdown, без коментарів, без преамбули.
Уся аналітика — українською. Числа бери з блоку даних.

ДАНІ:
${dataContext}`;

    // PR-25: template-report заздалегідь — як stubResponse для StubProvider,
    // так і як автоматичний fallback на Anthropic-помилку.
    const templateReport = buildTemplateReport(parsed.data);
    const fallbackOnError =
      options.fallbackOnError ?? env.LLM_DIGEST_FALLBACK_ON_ERROR;

    const provider =
      options.provider ??
      getLLMProvider({
        provider: env.LLM_DIGEST_PROVIDER,
        anthropicApiKey: apiKey,
        stubResponse: { text: JSON.stringify(templateReport) },
      });

    const llmResult = await invokeLLM(
      provider,
      {
        model: "claude-sonnet-4-6",
        maxTokens: 2500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        endpoint: "internal/weekly-digest",
        timeoutMs: 45_000,
      },
      options.addBreadcrumb ? { addBreadcrumb: options.addBreadcrumb } : {},
    );

    let report: WeeklyDigestReport;
    let usedFallback = false;

    if (!llmResult.ok) {
      if (!fallbackOnError) {
        throw new ExternalServiceError(llmResult.error || "AI error", {
          status: llmResult.status || 502,
          code: "ANTHROPIC_ERROR",
        });
      }
      // Fail-soft: повертаємо template-звіт. invokeLLM вже поклав breadcrumb
      // level=warning та інкрементнув Prom-counter outcome!=ok.
      logger.warn({
        msg: "weekly_digest_llm_fallback_to_template",
        provider: provider.name,
        outcome: llmResult.code,
        status: llmResult.status,
      });
      report = templateReport;
      usedFallback = true;
    } else {
      const rawReport = extractJsonObject(llmResult.text);
      if (!rawReport) {
        if (!fallbackOnError) {
          throw new ExternalServiceError("Не вдалося розпарсити відповідь AI", {
            status: 502,
            code: "ANTHROPIC_PARSE_ERROR",
          });
        }
        logger.warn({
          msg: "weekly_digest_llm_parse_fallback_to_template",
          provider: provider.name,
        });
        report = templateReport;
        usedFallback = true;
      } else {
        // Validate Claude's output against the schema (SSOT in
        // `@sergeant/shared/schemas/api`; Hard Rule #3). Shape drift from the
        // LLM becomes a 502 at the edge rather than typed lies reaching the UI.
        const reportParse = WeeklyDigestReportSchema.safeParse(rawReport);
        if (!reportParse.success) {
          if (!fallbackOnError) {
            throw new ExternalServiceError(
              "Відповідь AI не відповідає очікуваній структурі звіту",
              {
                status: 502,
                code: "ANTHROPIC_SHAPE_MISMATCH",
              },
            );
          }
          logger.warn({
            msg: "weekly_digest_llm_shape_fallback_to_template",
            provider: provider.name,
          });
          report = templateReport;
          usedFallback = true;
        } else {
          report = reportParse.data;
        }
      }
    }

    const generatedAt = new Date().toISOString();

    res.status(200).json(
      WeeklyDigestSuccessSchema.parse({
        report,
        generatedAt,
      }),
    );

    // AI memory ingest hook (PR2). Fire-and-forget після відправки відповіді,
    // щоб не затримувати клієнт. `userId` беремо з сесії; для anon-режиму
    // (квота через IP) digest без `req.user` теж генерується — у такому разі
    // memory не зберігаємо. `weekRange` як sourceRef означає, що повторні
    // generate-кліки за той самий тиждень дедуплікуються (jobId-rule у BullMQ).
    //
    // PR-25: template-fallback теж enqueue-ить memory (краще зберегти числа,
    // ніж залишити gap у history); тег `usedFallback` потрапляє у metadata
    // для post-hoc query "які тижні згенеровані без AI?".
    const sessionUser = (req as WithSessionUser).user ?? null;
    if (sessionUser?.id && weekRange) {
      try {
        const content = buildDigestMemoryContent(weekRange, report);
        void enqueueMemoryIngest({
          userId: sessionUser.id,
          source: "digest",
          sourceRef: weekRange,
          content,
          metadata: {
            weekRange,
            generatedAt,
            sections: {
              finyk: !!finyk,
              fizruk: !!fizruk,
              nutrition: !!nutrition,
              routine: !!routine,
            },
            usedFallback,
          },
        });
      } catch (err) {
        // enqueueMemoryIngest сам не throw-ить, але buildDigestMemoryContent
        // теоретично може у крайньому випадку — не валимо response через це.
        logger.warn({
          msg: "weekly_digest_memory_ingest_skipped",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };
}

/**
 * Default export — production handler без custom options. Читає
 * `LLM_DIGEST_PROVIDER` / `LLM_DIGEST_FALLBACK_ON_ERROR` з env.
 * Express-роутер у `apps/server/src/routes/weekly-digest.ts` використовує
 * цей default. Тести (`weekly-digest.test.ts`) — `createWeeklyDigestHandler({...})`.
 */
const defaultHandler = createWeeklyDigestHandler();
export default defaultHandler;
