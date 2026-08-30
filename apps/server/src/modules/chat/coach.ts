import type { Request, Response } from "express";
import pool from "../../db.js";
import { getLLMProvider, invokeLLM } from "../../lib/llm/provider.js";
import { env } from "../../env/env.js";
import { resolveProTier } from "./aiQuota.js";
import { parseBody } from "../../http/validate.js";
import {
  CoachInsightSchema,
  CoachMemoryPostSchema,
} from "../../http/schemas.js";
import { makeAiProviderError } from "../../obs/errors.js";
import { logger } from "../../obs/logger.js";

import { ADVICE_BOUNDARY_RULE } from "../../lib/adviceBoundary.js";
import { VOICE_RULE } from "./toolDefs/systemPrompt.js";

type WithSessionUser = Request & { user?: { id: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

interface WeeklyDigestEntry {
  weekKey: string;
  weekRange?: string | undefined;
  generatedAt: string;
  finyk?: { summary?: string } | null | undefined;
  fizruk?: { summary?: string } | null | undefined;
  nutrition?: { summary?: string } | null | undefined;
  routine?: { summary?: string } | null | undefined;
  overallRecommendations?: string[] | undefined;
  correlations?: string[] | undefined;
}

export interface CoachMemory {
  weeklyDigests: WeeklyDigestEntry[];
  lastInsightDate: string | null;
  lastInsightText: string | null;
}

/** Знімок тижня, з якого коуч будує повідомлення дня. */
export interface CoachSnapshot {
  dateContext?: {
    todayKey?: string;
    weekDayUk?: string;
    dayOfWeekIso?: number;
    daysIntoWeek?: number;
    weekRange?: string;
  };
  finyk?: {
    totalSpent?: number;
    totalIncome?: number;
    txCount?: number;
    topCategories?: Array<{ name: string; amount: number }>;
  };
  fizruk?: {
    workoutsCount?: number;
    totalVolume?: number;
    recoveryLabel?: string;
  };
  nutrition?: {
    avgKcal?: number;
    targetKcal?: number;
    avgProtein?: number;
    daysLogged?: number;
  };
  routine?: { overallRate?: number; habitCount?: number };
}

interface IncomingMemory {
  weeklyDigest?: {
    weekKey: string;
    weekRange?: string;
    generatedAt?: string;
    finyk?: { summary?: string } | null;
    fizruk?: { summary?: string } | null;
    nutrition?: { summary?: string } | null;
    routine?: { summary?: string } | null;
    overallRecommendations?: string[];
    correlations?: string[];
  };
}

async function getMemory(userId: string): Promise<CoachMemory | null> {
  // EXPLAIN ANALYZE: Index Scan using coach_memory_pkey на PRIMARY KEY
  //   (user_id) — point-lookup, O(log N), < 1мс.
  // До 2026-05-06 row жив у `module_data WHERE module='coach'`; перенесено
  // у власну таблицю міграцією 045 як precondition для Stage 7 drop-у
  // module_data column-у.
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM coach_memory WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const raw = result!.rows[0]!.data;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as CoachMemory;
  } catch {
    // JSON.parse threw — the DB row is stored in a non-standard format (may
    // happen if the blob was written by an older version). Returning the raw
    // value is a safe-ish fallback but the in-memory shape may be incomplete.
    // Log at warn so the on-call can investigate unexpected fallback spikes.
    logger.warn({
      msg: "coach_memory_parse_fallback",
      detail: "JSON.parse failed for coach_memory.data; using raw DB value",
    });
    return raw as CoachMemory;
  }
}

// Maximum size for the JSONB blob persisted in `coach_memory.data`.
// Історично жив у `apps/server/src/modules/sync/sync.ts` як спільна
// межа для v1 cloudSync push payload-у і coach memory write-у. Після
// 410-Gone-у v1 sync-handler-ів і drop-у `module_data` (PR #2003 +
// PR #2010 + PR #2018 + цей PR) ліміт ре-локалізовано у власника-
// читача — coach module, єдиного активного writer-а jsonb-блоб-у.
export const MAX_BLOB_SIZE = 5 * 1024 * 1024;

// Власний тип помилки, щоб handler міг відрізнити overflow від інших DB-фейлів
// і повернути 413 замість 500.
export class CoachMemoryTooLargeError extends Error {
  public readonly bytes: number;
  constructor(bytes: number) {
    super(`coach memory blob too large: ${bytes} bytes`);
    this.name = "CoachMemoryTooLargeError";
    this.bytes = bytes;
  }
}

async function saveMemory(userId: string, memory: CoachMemory): Promise<void> {
  const blob = JSON.stringify(memory);
  // Ділимо той самий `MAX_BLOB_SIZE`, що й історично жив у `module_data.data`
  // — один стовпчик jsonb, той самий пейлоад-транспорт, тож будь-яке
  // різне ліміти-рішення буде сюрпризом.
  if (blob.length > MAX_BLOB_SIZE) {
    throw new CoachMemoryTooLargeError(blob.length);
  }
  await pool.query(
    `INSERT INTO coach_memory (user_id, data, client_updated_at, version)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (user_id) DO UPDATE
       SET data = $2, server_updated_at = NOW(), version = coach_memory.version + 1`,
    [userId, blob],
  );
}

function mergeMemory(
  existing: CoachMemory | null,
  incoming: IncomingMemory,
): CoachMemory {
  const base: CoachMemory = existing || {
    weeklyDigests: [],
    lastInsightDate: null,
    lastInsightText: null,
  };

  const digests = Array.isArray(base.weeklyDigests)
    ? [...base.weeklyDigests]
    : [];

  if (incoming.weeklyDigest) {
    const entry: WeeklyDigestEntry = {
      weekKey: incoming.weeklyDigest.weekKey,
      weekRange: incoming.weeklyDigest.weekRange,
      generatedAt:
        incoming.weeklyDigest.generatedAt || new Date().toISOString(),
      finyk: incoming.weeklyDigest.finyk ?? null,
      fizruk: incoming.weeklyDigest.fizruk ?? null,
      nutrition: incoming.weeklyDigest.nutrition ?? null,
      routine: incoming.weeklyDigest.routine ?? null,
      overallRecommendations:
        incoming.weeklyDigest.overallRecommendations ?? [],
      correlations: incoming.weeklyDigest.correlations ?? [],
    };
    const existingIdx = digests.findIndex((d) => d.weekKey === entry.weekKey);
    if (existingIdx >= 0) {
      digests[existingIdx] = entry;
    } else {
      digests.push(entry);
    }
    digests.sort((a, b) => (b.weekKey > a.weekKey ? 1 : -1));
    if (digests.length > 12) digests.length = 12;
  }

  return {
    weeklyDigests: digests,
    lastInsightDate: base.lastInsightDate,
    lastInsightText: base.lastInsightText,
  };
}

/**
 * Найсвіжіші дедупльовані кореляції з тижневих дайджестів (найновіші тижні
 * першими). Спільна вибірка для weekly-insight prompt-у (`buildMemorySummary`)
 * і `/api/chat` surfacing-у (`getCoachCorrelationsBlock`) — обидва хочуть той
 * самий порядок і дедуп, різниться лише формат навколо.
 */
function pickRecentCorrelations(
  digests: readonly WeeklyDigestEntry[],
  max: number,
): string[] {
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const d of digests) {
    for (const c of d.correlations || []) {
      if (seen.has(c)) continue;
      seen.add(c);
      picked.push(c);
      if (picked.length >= max) break;
    }
    if (picked.length >= max) break;
  }
  return picked;
}

function buildMemorySummary(memory: CoachMemory | null): string {
  if (
    !memory ||
    !Array.isArray(memory.weeklyDigests) ||
    memory.weeklyDigests.length === 0
  ) {
    return "Памʼяті ще немає — це перший сеанс.";
  }

  const lines: string[] = [];
  const digests = memory.weeklyDigests.slice(0, 8);
  lines.push(`Накопичено даних за ${digests.length} тижнів.`);

  const finykSummaries = digests
    .filter((d) => d.finyk?.summary)
    .map((d) => `  • ${d.weekRange || d.weekKey}: ${d.finyk!.summary}`);
  if (finykSummaries.length) {
    lines.push("Фінанси (по тижнях):");
    lines.push(...finykSummaries.slice(0, 4));
  }

  const fizrukSummaries = digests
    .filter((d) => d.fizruk?.summary)
    .map((d) => `  • ${d.weekRange || d.weekKey}: ${d.fizruk!.summary}`);
  if (fizrukSummaries.length) {
    lines.push("Тренування (по тижнях):");
    lines.push(...fizrukSummaries.slice(0, 4));
  }

  const nutritionSummaries = digests
    .filter((d) => d.nutrition?.summary)
    .map((d) => `  • ${d.weekRange || d.weekKey}: ${d.nutrition!.summary}`);
  if (nutritionSummaries.length) {
    lines.push("Харчування (по тижнях):");
    lines.push(...nutritionSummaries.slice(0, 4));
  }

  const routineSummaries = digests
    .filter((d) => d.routine?.summary)
    .map((d) => `  • ${d.weekRange || d.weekKey}: ${d.routine!.summary}`);
  if (routineSummaries.length) {
    lines.push("Звички (по тижнях):");
    lines.push(...routineSummaries.slice(0, 4));
  }

  // Помічені звʼязки — крос-модульні кореляції, пораховані КОДОМ на клієнті
  // (не LLM) під час weekly-digest. Даємо коучу «у дні тренувань ти витрачаєш
  // менше» без окремого виклику моделі. Найсвіжіші тижні першими, дедуп.
  const correlations = pickRecentCorrelations(digests, 4);
  if (correlations.length) {
    lines.push("Помічені звʼязки:");
    correlations.forEach((c) => lines.push(`  • ${c}`));
  }

  const allRecs = digests
    .flatMap((d) => d.overallRecommendations || [])
    .slice(0, 6);
  if (allRecs.length) {
    lines.push("Попередні рекомендації:");
    allRecs.forEach((r) => lines.push(`  • ${r}`));
  }

  return lines.join("\n");
}

/** Максимум кореляцій у /api/chat system-блоці — коротко, щоб не роздувати prompt на кожному турі. */
const CHAT_CORRELATIONS_MAX = 3;

/**
 * Готовий system-prompt блок із найсвіжішими крос-модульними кореляціями для
 * `/api/chat` (перший тур, дзеркалить `buildRagContext`). Дані вже пораховані
 * КОДОМ на клієнті під час weekly-digest (WP3) і персистовані в
 * `coach_memory` — тут лише читаємо й форматуємо, нової математики немає.
 * Fail-safe: будь-яка помилка (в т.ч. відсутній userId) → "", чат лишається
 * працездатним без блоку.
 */
export async function getCoachCorrelationsBlock(
  userId: string,
): Promise<string> {
  try {
    const memory = await getMemory(userId);
    const digests = memory?.weeklyDigests;
    if (!Array.isArray(digests) || digests.length === 0) return "";
    const latest = digests[0];
    if (!latest) return "";
    const picked = pickRecentCorrelations(digests, CHAT_CORRELATIONS_MAX);
    if (picked.length === 0) return "";
    const asOf = latest.weekRange || latest.weekKey;
    return [
      "",
      `ПОМІЧЕНІ ЗАКОНОМІРНОСТІ (станом на ${asOf}, з тижневого дайджесту):`,
      ...picked.map((c) => `- ${c}`),
    ].join("\n");
  } catch (err) {
    logger.warn({
      msg: "coach_correlations_chat_block_error",
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

/**
 * Максимальна довжина тіла пуша, яку приймає SW (`sanitize(payload.body, 200)`
 * у `apps/web/src/sw/pushPayload.ts`). Ріжемо на запису, а не на відправці:
 * інакше в БД лежав би текст, довший за все, що взагалі може долетіти до юзера.
 */
const NUDGE_BODY_MAX = 200;

/**
 * Кладе останній згенерований текст поради у `sergeant_nudge_cache` для
 * серверного проходу підштовхувань (міграція 100).
 *
 * Fire-and-forget за задумом: юзер уже отримав пораду у відповіді, і збій
 * запису кешу не має перетворюватись на помилку запиту. Один рядок на юзера —
 * прохід читає лише найсвіжіший, історія не потрібна.
 */
async function saveNudgeCache(userId: string, body: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO sergeant_nudge_cache (user_id, body, generated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET body = EXCLUDED.body, generated_at = NOW()`,
      [userId, body.slice(0, NUDGE_BODY_MAX)],
    );
  } catch (err) {
    logger.warn({
      msg: "sergeant_nudge_cache_write_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * GET /api/coach/memory — віддати поточну coach-памʼять користувача.
 * `req.user` гарантовано заповнений middleware-ом `requireSession`.
 */
export async function coachMemoryGet(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  const memory = await getMemory(userId);
  res.json({ ok: true, memory: memory || null });
}

/**
 * POST /api/coach/memory — merge incoming digest у збережену памʼять.
 * `req.user` гарантовано заповнений middleware-ом `requireSession`.
 */
export async function coachMemoryPost(
  req: Request,
  res: Response,
): Promise<void> {
  const incoming = parseBody(CoachMemoryPostSchema, req) as IncomingMemory;
  const userId = (req as WithSessionUser).user!.id;
  const existing = await getMemory(userId);
  const merged = mergeMemory(existing, incoming);
  try {
    await saveMemory(userId, merged);
  } catch (err: unknown) {
    if (err instanceof CoachMemoryTooLargeError) {
      res.status(413).json({ error: "Coach memory blob too large" });
      return;
    }
    throw err;
  }
  res.json({ ok: true });
}

/**
 * Промпт повідомлення дня — рівно той, що йде в прод.
 *
 * AI-CONTEXT: винесено з `coachInsight`, щоб стенд
 * (`scripts/eval/pipelines.finance.ts`) міряв прод-промпт, а не однорядкову
 * заглушку. Промпт динамічний (памʼять + знімок тижня), тож експортується
 * білдер; стенд подає йому фіксований зразок.
 *
 * Прод шле весь текст ОДНИМ user-повідомленням без `system` — це не помилка
 * винесення, а поточна поведінка. Стенд має її дзеркалити, інакше міряє
 * інший режим моделі.
 */
export function buildCoachInsightPrompt(input: {
  snapshot: CoachSnapshot;
  memory: CoachMemory | null;
}): { user: string } {
  const { snapshot, memory } = input;
  const memorySummary = buildMemorySummary(memory);

  const dateContext = snapshot?.dateContext;
  // AI-NOTE: Темпоральний контекст шлемо явно — без нього модель імпровізує
  // "середина тижня" в неділю (issue з порадою на 26.04.2026). `daysIntoWeek`
  // = `dayOfWeekIso` (понеділок-старт), повторюємо як окреме поле, щоб модель
  // не плуталась між «номером дня» і «скільки пройшло».
  const dateLines: string[] = [];
  if (dateContext?.todayKey || dateContext?.weekDayUk) {
    const parts: string[] = [];
    if (dateContext.todayKey) parts.push(dateContext.todayKey);
    if (dateContext.weekDayUk) parts.push(dateContext.weekDayUk);
    dateLines.push(`Сьогодні: ${parts.join(", ")}.`);
  }
  if (dateContext?.weekRange) {
    dateLines.push(
      `Поточний тиждень (понеділок–неділя): ${dateContext.weekRange}.`,
    );
  }
  if (typeof dateContext?.daysIntoWeek === "number") {
    dateLines.push(
      `День тижня: ${dateContext.daysIntoWeek} з 7 (тиждень ${
        dateContext.daysIntoWeek >= 7 ? "завершується" : "у процесі"
      }).`,
    );
  }
  const dateContextText = dateLines.length
    ? dateLines.join("\n")
    : 'Поточну дату не передано — НЕ використовуй темпоральні маркери ("сьогодні", "середина тижня", "кінець тижня").';

  const snapshotLines: string[] = [];
  if (snapshot?.finyk) {
    snapshotLines.push(
      `[ФІНАНСИ ЦЬОГО ТИЖНЯ] Витрати: ${snapshot.finyk.totalSpent ?? 0} грн, Надходження: ${snapshot.finyk.totalIncome ?? 0} грн, Транзакцій: ${snapshot.finyk.txCount ?? 0}`,
    );
    if (snapshot.finyk.topCategories?.length) {
      snapshotLines.push(
        "Топ витрат: " +
          snapshot.finyk.topCategories
            .map((c) => `${c.name} ${c.amount} грн`)
            .join(", "),
      );
    }
  }
  if (snapshot?.fizruk) {
    snapshotLines.push(
      `[ТРЕНУВАННЯ ЦЬОГО ТИЖНЯ] Тренувань: ${snapshot.fizruk.workoutsCount ?? 0}, Обʼєм: ${snapshot.fizruk.totalVolume ?? 0} кг, Відновлення: ${snapshot.fizruk.recoveryLabel ?? "?"}`,
    );
  }
  if (snapshot?.nutrition) {
    snapshotLines.push(
      `[ХАРЧУВАННЯ ЦЬОГО ТИЖНЯ] Середньо: ${snapshot.nutrition.avgKcal ?? 0} ккал/день (ціль ${snapshot.nutrition.targetKcal ?? 2000}), Білок: ${snapshot.nutrition.avgProtein ?? 0}г/день, Днів: ${snapshot.nutrition.daysLogged ?? 0}/7`,
    );
  }
  if (snapshot?.routine) {
    snapshotLines.push(
      `[ЗВИЧКИ ЦЬОГО ТИЖНЯ] Виконання: ${snapshot.routine.overallRate ?? 0}%, Активних звичок: ${snapshot.routine.habitCount ?? 0}`,
    );
  }

  const snapshotText = snapshotLines.length
    ? snapshotLines.join("\n")
    : "Даних за поточний тиждень ще немає.";

  const systemPrompt = `Ти персональний AI-коуч у додатку "Мій простір". Ти знаєш цю людину по місяцях даних і говориш з нею як довірений коуч — тепло, але конкретно.

${ADVICE_BOUNDARY_RULE}

КОНТЕКСТ ДАТИ (Київ):
${dateContextText}

ПАМʼЯТЬ (попередні тижні):
${memorySummary}

ПОТОЧНИЙ ТИЖДЕНЬ:
${snapshotText}

ЯКЩО ДАНИХ БРАКУЄ — СКАЖИ ЦЕ, А НЕ ЗАПОВНЮЙ ПОРОЖНЕЧУ.
Рядок «Даних за поточний тиждень ще немає» — це не дані, а їх відсутність.
Коли патерну не видно, чесна відповідь — назвати це прямо й запропонувати
щось записати. Вигаданий висновок гірший за визнану відсутність висновку:
порожній тиждень — нормальний вихід, а не слот, який треба заповнити.

Сформулюй ОДНЕ коротке проактивне повідомлення дня (2-3 речення). Воно має:
- Відзначити конкретний патерн або прогрес (з даних) — або чесно сказати, що даних для висновку замало
- Запропонувати одну конкретну дію на сьогодні
- Бути особистим і мотивуючим, але без загальних фраз
- Якщо згадуєш "сьогодні" чи прогрес тижня — спирайся ТІЛЬКИ на КОНТЕКСТ ДАТИ; не вигадуй "середина тижня" / "кінець тижня" самостійно. Тиждень = понеділок→неділя.
- Порівнюючи з ПАМʼЯТТЮ, називай напрям прямо. Цифри впали — це спад, і сказати треба про спад, а не привітати з прогресом.
${VOICE_RULE}

Відповідай ТІЛЬКИ текстом повідомлення, без вітань, без підписів, без лапок.`;

  return { user: systemPrompt };
}

/**
 * POST /api/coach/insight — згенерувати AI-повідомлення дня.
 * `req.user`, `req.anthropicKey` і квота гарантуються middleware-ами роутера.
 */
export async function coachInsight(req: Request, res: Response): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const { snapshot, memory } = parseBody(CoachInsightSchema, req) as {
    snapshot: CoachSnapshot;
    memory: CoachMemory | null;
  };

  const prompt = buildCoachInsightPrompt({ snapshot, memory });

  // Pro tiered degradation: resolveProTier picks the OpenRouter model for this
  // Pro user's daily tier (premium gpt-5.1 → standard gemini-lite → floor free).
  // Free/anon тут лишаються на premium — на відміну від чату, який 2026-08-06
  // перевели на standard. Причина в співвідношенні: у чаті це −$0.014 на
  // повідомлення, а тут розрив gpt-5.1 → gemini-lite найбільший за якістю і
  // дає лише ~$0.0035 на виклик. Обґрунтування — в `aiQuota.ts::unpaid`.
  const tier = await resolveProTier(req, res, "coach");

  // Routed through the LLMProvider factory so coach can be re-targeted off
  // Sonnet via env (LLM_COACH_PROVIDER / OPENROUTER_COACH_MODEL) without a
  // redeploy; Anthropic stays the fallback. `env.COACH_MODEL_ANTHROPIC`
  // (default `claude-sonnet-4-6`) is the model the Anthropic provider uses —
  // окрема від `CHAT_MODEL_SYNTHESIS`, бо той під `CHAT_VIA_OPENROUTER`
  // несе OpenRouter-only id, на який Anthropic віддає 404.
  const provider = getLLMProvider({
    provider: env.LLM_COACH_PROVIDER,
    anthropicApiKey: apiKey,
    openrouterModel: tier.model,
  });
  const aiResult = await invokeLLM(provider, {
    model: env.COACH_MODEL_ANTHROPIC,
    maxTokens: 300,
    messages: [{ role: "user", content: prompt.user }],
    timeoutMs: 20_000,
    endpoint: "coach-insight",
    userId: (req as WithSessionUser).user?.id,
  });

  if (!aiResult.ok) {
    throw makeAiProviderError({
      rawProviderMessage: aiResult.error,
      status: aiResult.status,
    });
  }

  const text = aiResult.text;

  // AI-CONTEXT: тут раніше стояв fire-and-forget push з тим самим текстом,
  // який ми віддаємо у відповіді. Цей endpoint викликає ТІЛЬКИ клієнт на
  // передньому плані (`useCoachInsight`), тож юзер отримував сповіщення про
  // текст, який у цю ж секунду читає на екрані — і по одному з кожної
  // поверхні (веб + мобілка), без `tag`, без дедупу.
  //
  // Рішення власника (2026-08-01): пуш іде лише тоді, коли апка ЗАКРИТА.
  // Оскільки цей шлях за визначенням foreground, надсилати звідси нічого не
  // можна — але саме тут народжується єдиний текст, який прохід потім зможе
  // переслати. Сервер не вміє згенерувати пораду сам: снапшот приходить із
  // клієнтського SQLite. Тому кладемо «консерву» — прохід її переюзає, якщо
  // юзер завтра не зайде.
  const insightUserId = (req as WithSessionUser).user?.id;
  if (insightUserId && text && text.trim()) {
    void saveNudgeCache(insightUserId, text.trim());
  }

  res.json({ ok: true, insight: text });
}
