import { Router } from "express";
import { asyncHandler } from "../../http/index.js";
import { anthropicMessages } from "../../lib/anthropic.js";
import { maskPii } from "../../lib/pii-mask.js";
import { env } from "../../env.js";

export const CATEGORIES = [
  "groceries",
  "transport",
  "dining",
  "entertainment",
  "utilities",
  "health",
  "shopping",
  "education",
  "subscriptions",
  "income",
  "transfer",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface CategorizeArgs {
  description: string;
  amount?: number | null;
  mcc?: number | null;
}

export interface CategorizeResult {
  category: Category;
  confidence: number;
}

/**
 * Розбирає JSON-відповідь від Claude та повертає `CategorizeResult`. Толерантне
 * до code-fence-ів (```json …```) і "розмов навколо" — шукаємо першу JSON-діру у
 * тексті. На будь-яку парс-помилку чи невідому категорію — `{ "other", 0 }`,
 * щоб worker/handler ніколи не падали від несподіваного response shape.
 */
export function parseCategory(raw: string): CategorizeResult {
  const text = raw
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { category: "other", confidence: 0 };
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const category = CATEGORIES.includes(parsed.category as Category)
      ? (parsed.category as Category)
      : "other";
    const confidence =
      typeof parsed.confidence === "number"
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0;
    return { category, confidence };
  } catch {
    return { category: "other", confidence: 0 };
  }
}

/**
 * Pure helper — викликає Anthropic, повертає `CategorizeResult`. Винесено з
 * route-handler-а, щоб mono enrichment-worker (`modules/mono/enrichmentWorker.ts`)
 * міг переиспользувати ту саму prompt + parsing-логіку без round-trip через HTTP.
 *
 * `apiKey` параметризовано для тестабельності (хоча всередині процесу завжди
 * `env.ANTHROPIC_API_KEY`). Кидає помилку, якщо upstream не-OK — caller сам
 * вирішує чи це retryable (worker → backoff, route → 502).
 */
export async function categorizeTransaction(
  args: CategorizeArgs,
  apiKey: string = env.ANTHROPIC_API_KEY,
): Promise<CategorizeResult> {
  const description = args.description?.trim();
  if (!description) {
    throw new Error("categorizeTransaction: description is required");
  }
  const safeDescription = maskPii(description);
  const amountUah =
    args.amount != null ? Math.abs(Number(args.amount) / 100) : null;

  const userContent = [
    `Transaction: ${safeDescription}`,
    amountUah != null ? `Amount: ${amountUah.toFixed(2)} UAH` : null,
    args.mcc != null ? `MCC: ${args.mcc}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { response, data } = await anthropicMessages(
    apiKey,
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system:
        "You are a transaction categorizer for a Ukrainian personal finance app. " +
        "Categorize the transaction into exactly one of: groceries, transport, dining, " +
        "entertainment, utilities, health, shopping, education, subscriptions, income, " +
        'transfer, other. Respond with JSON only: {"category": "<value>", "confidence": 0.0-1.0}',
      messages: [{ role: "user", content: userContent }],
    },
    { endpoint: "internal/categorize", timeoutMs: 15_000 },
  );

  if (!response?.ok) {
    const status = response?.status ?? 0;
    throw new Error(
      `categorizeTransaction: upstream not ok (status=${status})`,
    );
  }

  const text =
    (
      data as {
        content?: Array<{ type: string; text?: string }>;
      }
    ).content?.[0]?.text ?? "";

  return parseCategory(text);
}

export function createCategorizeInternalRouter(): Router {
  const r = Router();

  r.post(
    "/api/internal/categorize",
    asyncHandler(async (req, res) => {
      const body = req.body as CategorizeArgs;
      // `.trim()`-перевірка дзеркалить інваріант `categorizeTransaction`
      // (якщо description порожній після trim — функція throw-ить, який
      // catch-блок нижче прикриє як 502 "AI service error"). Робимо це
      // тут, щоб whitespace-only payload отримав 400, а не misleading 502.
      if (!body?.description?.trim()) {
        res.status(400).json({ error: "description is required" });
        return;
      }
      try {
        const result = await categorizeTransaction({
          description: body.description,
          amount: body.amount,
          mcc: body.mcc,
        });
        res.json(result);
      } catch {
        res.status(502).json({ error: "AI service error" });
      }
    }),
  );

  return r;
}
