/**
 * Canned response templates for Layer 0 shortcuts.
 *
 * Simple Mustache-like interpolation for structured responses.
 * Used by shortcuts to render final user-facing messages from
 * tool results without needing an LLM.
 */

/** Simple template interpolation: replaces {{key}} with values. */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

// ─── Predefined response structures ──────────────────────────────────

export const METRIC_SUMMARY_TEMPLATE = `📊 **Метрики сьогодні**

**PostHog:**
{{posthog}}

**Stripe:**
{{stripe}}

**Sentry (top 5):**
{{sentry}}`;

export const STATUS_TEMPLATE = `🟢 **Статус продукту**

**Server:**
{{server}}

**Sentry:**
{{sentry}}`;

export const DIGEST_TEMPLATE = `📰 **Дайджест ({{period}})**

**PostHog:**
{{posthog}}

**Stripe:**
{{stripe}}

**Sentry:**
{{sentry}}

**PRs:**
{{prs}}`;

export const RECALL_TEMPLATE = `🧠 **Пам'ять**

{{memories}}`;

export const REMIND_TEMPLATE = `⏰ **Нагадування записано**

> {{what}}
> Коли: {{when}}

{{result}}`;
