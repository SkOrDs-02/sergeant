/**
 * Plugin config schema. Live config приходить з `openclaw.json` §
 * `plugin.config` (`ops/openclaw/openclaw.example.json`). Тут — Zod-схема,
 * яка валідує цей JSON на старті plugin-а; помилки fail-fast перед
 * registerTool, щоб OpenClaw ловив misconfig відразу, не runtime.
 */

import { z } from "zod";

export const PluginConfigSchema = z.object({
  /**
   * Internal API base URL (e.g. http://localhost:3000 у dev, або Railway
   * private URL у prod). Plugin звертається лише до /api/internal/openclaw/*.
   */
  serverInternalUrl: z.string().url(),

  /**
   * Bearer-token для `/api/internal/openclaw/*` (захист від не-Sergeant
   * викликів). `apps/server/src/routes/internal/index.ts` валідує проти
   * `INTERNAL_API_KEY` env. Min 32 chars (зменшує brute-force ризик).
   */
  internalApiKey: z.string().min(32),

  /**
   * Better Auth user id засновника. Усі recall_memory / record_decision
   * виклики проксяться під цим id (server-side allowlist гарантує, що
   * `cofounder` source доступний саме цьому користувачу).
   */
  founderUserId: z.string().min(1),

  /**
   * Per-call USD cap (Locked decision #4: `$0.5`). Plugin викликає
   * `/budget` з `kind: "per_call"` для перевірки на старті llm_input
   * hook-а. Парсимо рядок (бо у openclaw.json приходить через
   * `${OPENCLAW_MAX_PER_CALL_USD:-0.5}` env-substitution).
   */
  maxPerCallUsd: z.coerce.number().positive().default(0.5),

  /**
   * Council USD cap (Locked decision #4: `$2.0`). Phase 5 (PR-E) — поки
   * не використовується у PoC, але закладений у конфіг.
   */
  councilUsdBudget: z.coerce.number().positive().default(2.0),

  /**
   * n8n API URL + key. Phase 1 (PR-C) додасть n8n delegation tools;
   * у PoC поле опційне.
   */
  n8nApiUrl: z.string().url().optional(),
  n8nApiKey: z.string().optional(),

  /**
   * SEO env-stub credentials (Phase 1, PR-C). У PoC всі опційні —
   * відповідні tools поверталися з no-op result-ом, якщо не задано.
   */
  seo: z
    .object({
      gscServiceAccountKey: z.string().optional(),
      gscPropertyUrl: z.string().optional(),
      psiApiKey: z.string().optional(),
      serpApiKey: z.string().optional(),
    })
    .optional()
    .default({}),

  /**
   * Approval variant for write-tools (Locked decision #5). PoC прогоняє
   * усі три на `create_github_issue`; вибрана default ставка для
   * Phase 4 — `B`. Variant B = custom hook + own UX. Variant A = native
   * `requiresConfirmation` SDK-флаг. Variant C = hybrid (A + custom audit).
   */
  approvalVariant: z.enum(["A", "B", "C"]).default("B"),

  /**
   * Timeout (ms) для очікування callback-у у Variant B. Default 5 хв —
   * співрозмірно з реальним UX founder-а в Telegram DM.
   */
  approvalCallbackTimeoutMs: z.coerce
    .number()
    .int()
    .positive()
    .default(300_000),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Parses `configJson` (рядок з openclaw.json) у валідовану `PluginConfig`.
 * Кидає ZodError при misconfig — caller (entry point) ловить + log-ує.
 */
export function parsePluginConfig(configJson: string): PluginConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(configJson);
  } catch (err) {
    throw new Error(
      `OpenClaw plugin config is not valid JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  return PluginConfigSchema.parse(parsed);
}
