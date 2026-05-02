import { chatApi } from "@shared/api";
import { finykKeys } from "@shared/lib/queryKeys";
import { readJSON, writeJSON } from "../../lib/finykStorage";

// ─── React Query integration for AI chat lookups ──────────────────────────
//
// The Budgets page issues two kinds of AI requests:
//
//  1. **Proactive advice** (one request per at-risk category on the current
//     month) — eligible for a 24h cache backed by localStorage. The query is
//     keyed by `[monthKey, categoryId]` so the cache rolls over naturally
//     when the month changes.
//  2. **On-demand forecast explanation** (user clicks "Пояснити" on a
//     forecast card) — fired through `useMutation`. The text is stored in
//     per-category local state; we don't cache across sessions because the
//     button wording ("🔄 Пояснити знову") makes regeneration explicit.

const PROACTIVE_CACHE_PREFIX = "finyk_proactive_v1_";
export const PROACTIVE_CACHE_TTL = 24 * 60 * 60 * 1000;

export const proactiveCacheKey = (categoryId: string, monthKey: string) =>
  `${PROACTIVE_CACHE_PREFIX}${categoryId}_${monthKey}`;

// Re-export from the centralized queryKeys module for callers that still
// import this name from the Budgets page.
export const proactiveAdviceQueryKey = finykKeys.proactiveAdvice;

export function loadProactiveAdviceFromLS(
  categoryId: string,
  monthKey: string,
) {
  const cached = readJSON(proactiveCacheKey(categoryId, monthKey), null) as {
    text?: string;
    ts?: number;
  } | null;
  if (!cached || typeof cached !== "object") return null;
  const { text, ts } = cached;
  if (!text || !ts || Date.now() - ts > PROACTIVE_CACHE_TTL) return null;
  return { text, ts };
}

export function saveProactiveAdviceToLS(
  categoryId: string,
  monthKey: string,
  text: string,
) {
  writeJSON(proactiveCacheKey(categoryId, monthKey), {
    text,
    ts: Date.now(),
  });
}

export interface ProactiveItem {
  categoryId: string;
  monthKey: string;
  catLabel: string;
  spent: number;
  limit: number;
  remaining: number;
  pct: number;
  daysRemaining: number;
}

export async function fetchProactiveAdvice({
  categoryId,
  monthKey,
  catLabel,
  spent,
  limit,
  remaining,
  pct,
  daysRemaining,
}: ProactiveItem) {
  const prompt = `Категорія бюджету: ${catLabel}. Витрачено: ${spent.toLocaleString(
    "uk-UA",
  )} ₴ (${pct}% від ліміту ${limit.toLocaleString(
    "uk-UA",
  )} ₴). Залишок: ${remaining.toLocaleString(
    "uk-UA",
  )} ₴. До кінця місяця ${daysRemaining} днів. Дай конкретну коротку пораду (1-2 речення) що зробити, щоб не перевищити ліміт. Відповідь виключно українською.`;
  const data = await chatApi.send({
    context: `[Проактивна AI-порада] Категорія: ${catLabel}, витрачено: ${spent} ₴, ліміт: ${limit} ₴, залишок: ${remaining} ₴, днів до кінця місяця: ${daysRemaining}`,
    messages: [{ role: "user", content: prompt }],
  });
  const text = data.text || null;
  if (text) saveProactiveAdviceToLS(categoryId, monthKey, text);
  return text;
}
