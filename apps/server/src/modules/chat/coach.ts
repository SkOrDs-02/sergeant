import type { Request, Response } from "express";
import pool from "../../db.js";
import {
  anthropicMessages,
  extractAnthropicText,
} from "../../lib/anthropic.js";
import { sendToUserQuietly } from "../../push/send.js";
import { MAX_BLOB_SIZE } from "../sync/sync.js";
import { validateBody } from "../../http/validate.js";
import {
  CoachInsightSchema,
  CoachMemoryPostSchema,
} from "../../http/schemas.js";
import { ExternalServiceError } from "../../obs/errors.js";

type WithSessionUser = Request & { user?: { id: string } };
type WithAnthropicKey = Request & { anthropicKey?: string };

interface AnthropicErrorPayload {
  error?: { message?: string };
}

interface WeeklyDigestEntry {
  weekKey: string;
  weekRange?: string;
  generatedAt: string;
  finyk?: { summary?: string } | null;
  fizruk?: { summary?: string } | null;
  nutrition?: { summary?: string } | null;
  routine?: { summary?: string } | null;
  overallRecommendations?: string[];
}

interface CoachMemory {
  weeklyDigests: WeeklyDigestEntry[];
  lastInsightDate: string | null;
  lastInsightText: string | null;
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
  };
}

async function getMemory(userId: string): Promise<CoachMemory | null> {
  // EXPLAIN ANALYZE: Index Scan using module_data_user_id_module_key
  //   на UNIQUE(user_id, module) — point-lookup, O(log N), < 1мс.
  const result = await pool.query<{ data: unknown }>(
    `SELECT data FROM module_data WHERE user_id = $1 AND module = 'coach'`,
    [userId],
  );
  if (result.rows.length === 0) return null;
  const raw = result.rows[0].data;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as CoachMemory;
  } catch {
    return raw as CoachMemory;
  }
}

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
  // Ділимо той самий `MAX_BLOB_SIZE`, що й sync: це один стовпчик `module_data.data`
  // і той самий пейлоад-транспорт, тож будь-яке різне ліміти-рішення буде сюрпризом.
  if (blob.length > MAX_BLOB_SIZE) {
    throw new CoachMemoryTooLargeError(blob.length);
  }
  await pool.query(
    `INSERT INTO module_data (user_id, module, data, client_updated_at, version)
     VALUES ($1, 'coach', $2, NOW(), 1)
     ON CONFLICT (user_id, module) DO UPDATE
       SET data = $2, server_updated_at = NOW(), version = module_data.version + 1`,
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

function buildMemorySummary(memory: CoachMemory | null): string {
  if (
    !memory ||
    !Array.isArray(memory.weeklyDigests) ||
    memory.weeklyDigests.length === 0
  ) {
    return "Пам'яті ще немає — це перший сеанс.";
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

  const allRecs = digests
    .flatMap((d) => d.overallRecommendations || [])
    .slice(0, 6);
  if (allRecs.length) {
    lines.push("Попередні рекомендації:");
    allRecs.forEach((r) => lines.push(`  • ${r}`));
  }

  return lines.join("\n");
}

/**
 * GET /api/coach/memory — віддати поточну coach-пам'ять користувача.
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
 * POST /api/coach/memory — merge incoming digest у збережену пам'ять.
 * `req.user` гарантовано заповнений middleware-ом `requireSession`.
 */
export async function coachMemoryPost(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = validateBody(CoachMemoryPostSchema, req, res);
  if (!parsed.ok) return;
  const incoming = parsed.data as IncomingMemory;
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
 * POST /api/coach/insight — згенерувати AI-повідомлення дня.
 * `req.user`, `req.anthropicKey` і квота гарантуються middleware-ами роутера.
 */
export async function coachInsight(req: Request, res: Response): Promise<void> {
  const apiKey = (req as WithAnthropicKey).anthropicKey as string;
  const parsed = validateBody(CoachInsightSchema, req, res);
  if (!parsed.ok) return;
  const { snapshot, memory } = parsed.data as {
    snapshot: {
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
    };
    memory: CoachMemory | null;
  };

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
      `[ТРЕНУВАННЯ ЦЬОГО ТИЖНЯ] Тренувань: ${snapshot.fizruk.workoutsCount ?? 0}, Об'єм: ${snapshot.fizruk.totalVolume ?? 0} кг, Відновлення: ${snapshot.fizruk.recoveryLabel ?? "?"}`,
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

КОНТЕКСТ ДАТИ (Київ):
${dateContextText}

ПАМ'ЯТЬ (попередні тижні):
${memorySummary}

ПОТОЧНИЙ ТИЖДЕНЬ:
${snapshotText}

Сформулюй ОДНЕ коротке проактивне повідомлення дня (2-3 речення). Воно має:
- Відзначити конкретний патерн або прогрес (з даних)
- Запропонувати одну конкретну дію на сьогодні
- Бути особистим і мотивуючим, але без загальних фраз
- Якщо згадуєш "сьогодні" чи прогрес тижня — спирайся ТІЛЬКИ на КОНТЕКСТ ДАТИ; не вигадуй "середина тижня" / "кінець тижня" самостійно. Тиждень = понеділок→неділя.

Відповідай ТІЛЬКИ текстом повідомлення, без вітань, без підписів, без лапок.`;

  const { response: aiRes, data: aiData } = await anthropicMessages(
    apiKey,
    {
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: systemPrompt }],
    },
    { timeoutMs: 20000, endpoint: "coach-insight" },
  );

  if (!aiRes?.ok) {
    const errData = aiData as AnthropicErrorPayload | null | undefined;
    throw new ExternalServiceError(errData?.error?.message || "AI error", {
      status: aiRes?.status || 502,
    });
  }

  const text = extractAnthropicText(aiData);

  // Fire-and-forget push з AI-«нудж»-повідомленням дня. Якщо `text` порожній
  // (Anthropic повернула структуру без текстових блоків) — нічого не шлемо,
  // щоб не спамити юзеру порожній пуш. Side-effect non-fatal: `sendToUserQuietly`
  // ковтає будь-яку помилку всередині і лише логує, тож response юзеру ми
  // вже відправили і чекати на нього не треба.
  const userId = (req as WithSessionUser).user?.id;
  if (userId && text && text.trim()) {
    void sendToUserQuietly(
      userId,
      { title: "Коуч", body: text.trim().slice(0, 200) },
      { module: "coach" },
    );
  }

  res.json({ ok: true, insight: text });
}
