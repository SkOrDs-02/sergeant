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

  /**
   * Абсолютний шлях до файлу system prompt для Layer 1 cheap router.
   * Якщо задано — plugin читає prompt звідси при ініціалізації (дозволяє
   * оновити prompt через PR до ops/openclaw/cheap-router.system.md +
   * container restart, без релізу плагіна).
   * Якщо не задано — використовується вбудований CHEAP_ROUTER_SYSTEM_PROMPT.
   */
  cheapRouterSystemPromptPath: z.string().optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

/**
 * Parses `configJson` (рядок з openclaw.json) у валідовану `PluginConfig`.
 * Кидає ZodError при misconfig — caller (entry point) ловить + log-ує.
 *
 * Robustness: OpenClaw runtime іноді передає літеральний рядок `"undefined"`,
 * `"null"` або порожній рядок, коли config block у `plugins.entries.sergeant`
 * стрипається валідацією gateway (race з patch-as-code; див. ops/openclaw/
 * patch-sergeant-config.mjs). У такому випадку — fallback на env vars,
 * які Railway вже надає (`SERVER_INTERNAL_URL`, `INTERNAL_API_KEY`,
 * `OPENCLAW_FOUNDER_USER_ID`, ...).
 */
export function parsePluginConfig(
  configJson: string | null | undefined,
): PluginConfig {
  const isMissing =
    configJson == null ||
    configJson === "" ||
    configJson === "undefined" ||
    configJson === "null";

  if (isMissing) {
    return PluginConfigSchema.parse(buildConfigFromEnv());
  }

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

function buildConfigFromEnv(): Record<string, unknown> {
  const env = process.env;
  const cfg: Record<string, unknown> = {
    serverInternalUrl: env["SERVER_INTERNAL_URL"],
    internalApiKey: env["INTERNAL_API_KEY"],
    founderUserId: env["OPENCLAW_FOUNDER_USER_ID"],
    approvalVariant: "B",
    cheapRouterSystemPromptPath: "/root/.openclaw/cheap-router.system.md",
  };
  if (env["OPENCLAW_MAX_PER_CALL_USD"]) {
    cfg["maxPerCallUsd"] = env["OPENCLAW_MAX_PER_CALL_USD"];
  }
  if (env["OPENCLAW_COUNCIL_USD_BUDGET"]) {
    cfg["councilUsdBudget"] = env["OPENCLAW_COUNCIL_USD_BUDGET"];
  }
  if (env["N8N_API_URL"]) cfg["n8nApiUrl"] = env["N8N_API_URL"];
  if (env["N8N_API_KEY"]) cfg["n8nApiKey"] = env["N8N_API_KEY"];
  return cfg;
}
