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
  ForbiddenError,
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
import { readStoredDigest, type StoredDigest } from "./storedDigest.js";
import { replaceLongDash } from "../../lib/modelText.js";
import {
  countModuleSignals,
  HEALTH_CONSENT_REQUIRED_CODE,
  HEALTH_CONSENT_REQUIRED_MESSAGE,
  MIN_SIGNAL_MODULES,
} from "@sergeant/shared";
import { resolveHealthConsent } from "../../lib/healthConsent.js";
import { abortOnClientClose } from "../../http/clientAbort.js";

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
          summary: `Витрати ${finyk.totalSpent ?? 0} грн, надходження ${finyk.totalIncome ?? 0} грн, ${finyk.txCount ?? 0} операцій.`,
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
  /**
   * Підмінка перевірки `healthDataConsent` для тестів. Production читає
   * збережену згоду з БД (`resolveHealthConsent`, fail-closed).
   */
  resolveHealthConsent?: (userId: string | undefined) => Promise<boolean>;
  /**
   * Підмінка читання збереженого звіту тижня (`ifAbsent`) для тестів.
   * Production читає памʼять коуча (`readStoredDigest`).
   */
  readStoredDigest?: (
    userId: string,
    weekKey: string,
  ) => Promise<StoredDigest | null>;
}

/** Результат однієї генерації, який ділять усі учасники польоту. */
interface DigestOutcome {
  report: WeeklyDigestReport;
  generatedAt: string;
  usedFallback: boolean;
  /** Звіт узято з памʼяті коуча (`ifAbsent`), моделі не було. */
  fromStore: boolean;
}

/**
 * Одна генерація звіту тижня в польоті, до якої приєднуються одночасні
 * запити тієї самої людини за той самий тиждень.
 *
 * `waiting` — скільки учасників ще чекають на відповідь. Модель обриваємо
 * лише тоді, коли зʼєднання закрили ВСІ: інакше закрита вкладка першого
 * пристрою зривала б звіт другому, який на нього чекає.
 */
interface DigestFlight {
  promise: Promise<DigestOutcome>;
  controller: AbortController;
  waiting: number;
  /** Політ почав запит з `ifAbsent`: він може віддати збережений звіт. */
  ifAbsent: boolean;
}

function attachToFlight(flight: DigestFlight, res: Response): void {
  flight.waiting += 1;
  // Юніт-тести підставляють `res` без EventEmitter (як і `abortOnClientClose`).
  if (typeof res.on !== "function") return;
  res.on("close", () => {
    if (res.writableFinished) return;
    flight.waiting -= 1;
    if (flight.waiting <= 0) flight.controller.abort();
  });
}

/**
 * POST /api/weekly-digest — згенерувати тижневий звіт. CORS/method/key/quota
 * забезпечені middleware-ами роутера; тут лише бізнес-логіка. Ключ Anthropic
 * читається з `req.anthropicKey`.
 *
 * AI-CONTEXT (С-3 (а), OD-30, 2026-11-18): одночасні запити тієї самої
 * людини за той самий `weekKey` ділять ОДИН виклик моделі (single-flight у
 * памʼяті процесу, той самий механізм, що `inFlightRefresh` у
 * `silpo/tokenStore.ts` і `exportsInFlight` у `routes/me.ts`). Сценарій —
 * два пристрої, що відкрили хаб у ті самі хвилини: обидва не знайшли звіту в
 * памʼяті коуча й обидва попросили генерацію. Другий отримує той самий
 * `{ report, generatedAt }`, памʼять AI пише лише перший.
 *
 * `ifAbsent: true` (шле лише автогенерація) — «згенеруй, лише якщо звіту
 * тижня ще немає»: усередині того самого польоту сервер спершу читає памʼять
 * коуча за `weekKey` і, якщо звіт там є, віддає його без виклику моделі.
 * Запит без поля (ручне «Оновити звіт») генерує заново й до польоту з
 * `ifAbsent` не приєднується, бо той міг віддати старий звіт. Замок на один
 * інстанс (ADR-0074); якщо бекенд поїде в кілька реплік, другий інстанс
 * знову дасть дубль.
 */
export function createWeeklyDigestHandler(
  options: WeeklyDigestHandlerOptions = {},
): (req: Request, res: Response) => Promise<void> {
  const inFlight = new Map<string, DigestFlight>();

  return async function handler(req: Request, res: Response): Promise<void> {
    const apiKey = (req as WithAnthropicKey).anthropicKey as string;

    const rawParsed = parseBody(WeeklyDigestSchema, req);

    // Гейт на дані про здоровʼя (GDPR Art. 9, рішення власника 2026-09-29):
    // без збереженої згоди секції Фізрука й Харчування відкидаємо ДО
    // лічильника сигналів, промпту й шаблонного fallback-у — ні в модель, ні
    // в `ai_memories` вони не потраплять. Фінанси/звички звіт не ламає.
    const healthConsent = await (
      options.resolveHealthConsent ?? resolveHealthConsent
    )((req as WithSessionUser).user?.id);
    const parsed: WeeklyDigestRequest = healthConsent
      ? rawParsed
      : { ...rawParsed, fizruk: null, nutrition: null };
    const { weekKey, weekRange, finyk, fizruk, nutrition, routine } = parsed;
    const ifAbsent = parsed.ifAbsent === true;

    // Гейт СТОЇТЬ ПЕРЕД побудовою промпту й перед мережевим викликом — тиждень
    // без жодного змістовного сигналу не має ані отримувати шаблонний AI-аналіз
    // нулів, ані палити виклик LLM. Заміняє стару структурну перевірку
    // `!sections.length`, яка через завжди-truthy `finyk` ніколи не спрацьовувала.
    if (countDigestSignalModules(parsed) < MIN_SIGNAL_MODULES) {
      // Якби health-секції дали б рівно той сигнал, якого бракує, — це не
      // «замало даних», а «потрібна згода»: люди мають знати, що робити.
      if (
        !healthConsent &&
        countDigestSignalModules(rawParsed) >= MIN_SIGNAL_MODULES
      ) {
        throw new ForbiddenError(HEALTH_CONSENT_REQUIRED_MESSAGE, {
          code: HEALTH_CONSENT_REQUIRED_CODE,
        });
      }
      throw new ValidationError(
        "Замало даних за цей тиждень для звіту. Додай операцію, тренування, прийом їжі чи звичку і спробуй ще раз.",
        { code: "INSUFFICIENT_DATA" },
      );
    }

    const sessionUser = (req as WithSessionUser).user ?? null;
    const memorySourceRef = weekKey ?? weekRange ?? null;
    const flightKey =
      sessionUser?.id && memorySourceRef
        ? `${sessionUser.id}\u0000${memorySourceRef}`
        : null;

    const candidate = flightKey ? inFlight.get(flightKey) : undefined;
    const joined =
      candidate && (ifAbsent || !candidate.ifAbsent) ? candidate : undefined;
    if (joined) {
      attachToFlight(joined, res);
      // Помилку лідера (збій апстріму) отримує й цей запит: повтор того
      // самого виклику в ту саму секунду дав би той самий збій.
      const shared = await joined.promise;
      logger.info({ msg: "weekly_digest_coalesced" });
      res.status(200).json(
        WeeklyDigestSuccessSchema.parse({
          report: shared.report,
          generatedAt: shared.generatedAt,
        }),
      );
      return;
    }

    // Між `get` вище і `set` нижче немає жодного `await`, тож другий запит
    // не може проскочити в цю щілину (один потік подій).
    const controller = flightKey ? new AbortController() : null;
    const signal = controller ? controller.signal : abortOnClientClose(res);
    const storedLookup =
      ifAbsent && sessionUser?.id && weekKey
        ? { userId: sessionUser.id, weekKey }
        : null;
    const generation = storedLookup
      ? storedOrGenerate(storedLookup, parsed, apiKey, signal, req)
      : generateDigest(parsed, apiKey, signal, req);
    let flight: DigestFlight | null = null;
    if (flightKey && controller) {
      flight = { promise: generation, controller, waiting: 0, ifAbsent };
      attachToFlight(flight, res);
      inFlight.set(flightKey, flight);
      // Приєднані запити чекають на `flight.promise` самі; тут лише
      // гасимо unhandled rejection у гілці без приєднаних.
      generation.catch(() => undefined);
    }

    let outcome: DigestOutcome;
    try {
      outcome = await generation;
    } finally {
      if (flightKey && inFlight.get(flightKey) === flight) {
        inFlight.delete(flightKey);
      }
    }
    const { report, generatedAt, usedFallback, fromStore } = outcome;

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
    // Збережений звіт у памʼять AI уже потрапив, коли його генерували.
    if (sessionUser?.id && memorySourceRef && !fromStore) {
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

  /**
   * `ifAbsent`: збережений звіт тижня, якщо він є, інакше генерація. Збій
   * читання памʼяті не валить запит: генеруємо, як без `ifAbsent` (у гіршому
   * разі це дубль, а не відсутній звіт).
   */
  async function storedOrGenerate(
    lookup: { userId: string; weekKey: string },
    parsed: WeeklyDigestRequest,
    apiKey: string,
    signal: AbortSignal,
    req: Request,
  ): Promise<DigestOutcome> {
    const stored = await (options.readStoredDigest ?? readStoredDigest)(
      lookup.userId,
      lookup.weekKey,
    ).catch((err: unknown) => {
      logger.warn({
        msg: "weekly_digest_stored_read_failed",
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    if (stored) {
      logger.info({ msg: "weekly_digest_served_stored" });
      return {
        report: stored.report,
        generatedAt: stored.generatedAt,
        usedFallback: false,
        fromStore: true,
      };
    }
    return generateDigest(parsed, apiKey, signal, req);
  }

  /** Виклик моделі й розбір відповіді (або шаблонний fallback). */
  async function generateDigest(
    parsed: WeeklyDigestRequest,
    apiKey: string,
    signal: AbortSignal,
    req: Request,
  ): Promise<DigestOutcome> {
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
        signal,
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

    return { report, generatedAt, usedFallback, fromStore: false };
  }
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
