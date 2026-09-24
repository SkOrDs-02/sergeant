import type { Request, Response } from "express";
import { parseBody } from "../../http/validate.js";
import {
  WeeklyDigestSchema,
  WeeklyDigestReportSchema,
  WeeklyDigestSuccessSchema,
  type WeeklyDigestReport,
  type WeeklyDigestRequest,
} from "../../http/schemas.js";
import {
  ExternalServiceError,
  ValidationError,
  makeAiProviderError,
} from "../../obs/errors.js";
import { env } from "../../env.js";
import {
  getLLMProvider,
  invokeLLM,
  type LLMBreadcrumbFn,
  type LLMProvider,
} from "../../lib/llm/provider.js";
import { logger } from "../../obs/logger.js";
import { als } from "../../obs/requestContext.js";
import { enqueueMemoryIngest } from "../ai-memory/ingestQueue.js";
import { getAiMemory } from "../ai-memory/bootstrap.js";
import { buildWeeklyDigestPrompt } from "./weeklyDigestPrompt.js";
import { replaceLongDash } from "../../lib/modelText.js";
import { countModuleSignals, MIN_SIGNAL_MODULES } from "@sergeant/shared";

export { buildWeeklyDigestPrompt };

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
      { summary?: string; comment?: string } | null | undefined;
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

/** Експортовано для стенду моделей — суддя має парсити рівно як прод. */
export function extractJsonObject(raw: unknown): unknown {
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
 * Скільки модулів дали ЗМІСТОВНИЙ сигнал за тиждень — тонкий делегат
 * `countModuleSignals` (`@sergeant/shared`), канон і для клієнтського
 * `coachSnapshotSignals` (`apps/web/src/core/insights/useCoachInsight.ts`),
 * зведено за аудитом §2.23 замість двох незалежних копій.
 *
 * AI-CONTEXT (Хвиля 4, hub-coach § G2): `finyk` приїжджає з клієнта
 * ЗАВЖДИ truthy (`aggregateFinyk` повертає нулі навіть без транзакцій), тож
 * стара перевірка «є хоч одна секція» (`!sections.length`) фактично ніколи
 * не спрацьовувала — порожній тиждень завжди мав хоча б finyk-секцію з
 * нулями, і дайджест генерувався з нічого. Рахуємо не «поле присутнє», а
 * факт даних.
 */
export function countDigestSignalModules(data: WeeklyDigestRequest): number {
  return countModuleSignals(data);
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
            "Це лише числа з тижневих даних: розбір зараз недоступний. Висновки додам, щойно зможу.",
          recommendations: [],
        }
      : null,
    fizruk: fizruk
      ? {
          summary: `${fizruk.workoutsCount ?? 0} тренувань, обсяг ${fizruk.totalVolume ?? 0} кг${
            fizruk.recoveryLabel ? `, стан: ${fizruk.recoveryLabel}` : ""
          }.`,
          comment:
            "Це лише числа з тижневих даних: розбір тренувань додам, щойно зможу.",
          recommendations: [],
        }
      : null,
    nutrition: nutrition
      ? {
          summary: `Середньодобово ${nutrition.avgKcal ?? 0} ккал з ${nutrition.daysLogged ?? 0}/7 днів записів.`,
          comment:
            "Це лише числа з тижневих даних: макроси й тенденції розберу, щойно зможу.",
          recommendations: [],
        }
      : null,
    routine: routine
      ? {
          summary: `${routine.habitCount ?? 0} звичок, загальний відсоток ${routine.overallRate ?? 0}%.`,
          comment:
            "Це лише числа з тижневих даних: розбір звичок додам, щойно зможу.",
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

    const parsed = parseBody(WeeklyDigestSchema, req);
    const { weekKey, weekRange, finyk, fizruk, nutrition, routine } = parsed;

    // Гейт СТОЇТЬ ПЕРЕД побудовою промпту й перед мережевим викликом — тиждень
    // без жодного змістовного сигналу не має ані отримувати шаблонний AI-аналіз
    // нулів, ані палити виклик LLM. Заміняє стару структурну перевірку
    // `!sections.length`, яка через завжди-truthy `finyk` ніколи не спрацьовувала.
    if (countDigestSignalModules(parsed) < MIN_SIGNAL_MODULES) {
      throw new ValidationError(
        "Замало даних за цей тиждень для звіту. Додай транзакцію, тренування, прийом їжі чи звичку — і спробуй ще раз.",
        { code: "INSUFFICIENT_DATA" },
      );
    }

    const prompt = buildWeeklyDigestPrompt(parsed);

    // PR-25: template-report заздалегідь — як stubResponse для StubProvider,
    // так і як автоматичний fallback на Anthropic-помилку.
    const templateReport = buildTemplateReport(parsed);
    const fallbackOnError =
      options.fallbackOnError ?? env.LLM_DIGEST_FALLBACK_ON_ERROR;

    const provider =
      options.provider ??
      getLLMProvider({
        provider: env.LLM_DIGEST_PROVIDER,
        anthropicApiKey: apiKey,
        openrouterModel: env.OPENROUTER_DIGEST_MODEL,
        stubResponse: { text: JSON.stringify(templateReport) },
      });

    const llmResult = await invokeLLM(
      provider,
      {
        model: env.DIGEST_MODEL,
        maxTokens: 2500,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
        endpoint: "internal/weekly-digest",
        timeoutMs: 45_000,
        userId: (req as WithSessionUser).user?.id,
        // Ініціатива 0025, Фаза 2 — «id прогону». Digest — один Anthropic-виклик
        // на HTTP-запит, тож переюзаємо вже наявний per-request W3C trace id
        // (`traceMiddleware`, `obs/requestContext.ts`) замість того, щоб
        // вигадувати новий: цей самий id уже йде в `X-Trace-Id` і Sentry.
        traceId: als.getStore()?.traceId ?? undefined,
      },
      options.addBreadcrumb ? { addBreadcrumb: options.addBreadcrumb } : {},
    );

    let report: WeeklyDigestReport;
    let usedFallback = false;

    if (!llmResult.ok) {
      if (!fallbackOnError) {
        throw makeAiProviderError({
          rawProviderMessage: llmResult.error,
          status: llmResult.status,
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
      // Довге тире в JSON буває лише всередині рядків, тож заміна по сирому
      // тексту дорівнює заміні в кожному текстовому полі звіту (аудит P2-3).
      const rawReport = extractJsonObject(replaceLongDash(llmResult.text));
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
    // щоб не затримувати клієнт (роут за requireSession(), тож req.user
    // завжди є — ADR-0086 прибрав анонімний режим).
    //
    // Семантика "остання генерація тижня перемагає" (2026-08-30, знахідка
    // W3 ревʼю дайджесту): sourceRef — канонічний weekKey (fallback на
    // weekRange для старих бандлів), а перед enqueue старий рядок тижня
    // hard-видаляється (той самий delete-then-insert патерн, що в
    // profileMirror: BullMQ jobId-дедуп інакше мовчки відкидає повторну
    // генерацію, і в памʼяті назавжди застигав перший, часто неповний,
    // знімок тижня). dedupeSalt=generatedAt робить кожну генерацію
    // окремим job-ом, а той самий знімок і далі дедуплікується.
    //
    // PR-25: template-fallback теж enqueue-ить memory (краще зберегти числа,
    // ніж залишити gap у history); тег `usedFallback` потрапляє у metadata
    // для post-hoc query "які тижні згенеровані без AI?".
    const sessionUser = (req as WithSessionUser).user ?? null;
    const memorySourceRef = weekKey ?? weekRange ?? null;
    if (sessionUser?.id && memorySourceRef) {
      const userId = sessionUser.id;
      void (async () => {
        try {
          const content = buildDigestMemoryContent(
            weekRange ?? memorySourceRef,
            report,
          );
          if (env.AI_MEMORY_ENABLED) {
            await getAiMemory()
              .forgetSource(userId, "digest", memorySourceRef)
              .catch((err: unknown) => {
                // Видалення — best-effort: якщо воно впало, enqueue все одно
                // спробує записати (перший знімок тижня краще за жодного).
                logger.warn({
                  msg: "weekly_digest_memory_forget_failed",
                  err: err instanceof Error ? err.message : String(err),
                });
              });
          }
          await enqueueMemoryIngest({
            userId,
            source: "digest",
            sourceRef: memorySourceRef,
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
            dedupeSalt: generatedAt,
            // PR-S3: тижневий звіт осідає в `ai_memories` і потім щоразу
            // підмішується в system prompt через `buildRagContext`. Коли в
            // ньому є секції Фізрука чи Їжі — це дані про здоровʼя, і на
            // персистентний запис потрібна окрема згода (GDPR Art. 9).
            // Прапорець рахується з ФАКТИЧНОГО складу звіту, не з джерела:
            // фінансово-рутинний тиждень health-даних не несе й гейтитись
            // не має.
            healthData: !!fizruk || !!nutrition,
          });
        } catch (err) {
          logger.warn({
            msg: "weekly_digest_memory_ingest_skipped",
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }
  };
}

/**
 * Default export — production handler без custom options. Читає
 * `LLM_DIGEST_PROVIDER` з env; `fallbackOnError` навмисно зафіксовано у
 * `false`, щоб збій Anthropic (вичерпані кредити, 5xx, timeout) завжди
 * піднімав ExternalServiceError → errorHandler → 5xx клієнту, а не
 * повертав тихий 200 з template-звітом.
 *
 * Fail-soft (template замість помилки) доступний лише у тестах і scoped
 * deployments через `createWeeklyDigestHandler({ fallbackOnError: true })`.
 * Express-роутер у `apps/server/src/routes/weekly-digest.ts` використовує
 * цей default.
 */
const defaultHandler = createWeeklyDigestHandler({ fallbackOnError: false });
export default defaultHandler;
