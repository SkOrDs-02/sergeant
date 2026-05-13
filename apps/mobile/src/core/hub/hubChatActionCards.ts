/**
 * Mobile-side mapper від tool-call result у структуровану action-картку.
 *
 * Це slim port `apps/web/src/core/lib/hubChatActionCards.ts` без
 * залежностей від web-specific `ChatAction` union — мобільний клієнт не
 * виконує tool-handler-ів локально (повний executor реєстр живе на web
 * і читає з localStorage). Замість цього картка будується суто з
 * `name` + `input` + текстового `result`, які повертає сервер.
 *
 * Підтримуваний набір tool-name-ів дзеркалить web-side §3 specu
 * `docs/design/specs/2026-04-24-assistant-quick-actions-v1-design.md`,
 * щоб картка відрендерилася для тих самих ключових дій.
 */

import type { ChatActionCardLite } from "./hubChatUtils";

export type ChatActionCardModule = ChatActionCardLite["module"];
export type ChatActionCardStatus = ChatActionCardLite["status"];
export type ChatActionCard = ChatActionCardLite;

/** Tools, класифіковані як ризикові за специфікацією §4. */
const RISKY_TOOLS: ReadonlySet<string> = new Set([
  "batch_categorize",
  "delete_transaction",
  "hide_transaction",
  "forget",
  "archive_habit",
  "import_monobank_range",
]);

const KNOWN_TOOLS: ReadonlySet<string> = new Set([
  "create_transaction",
  "find_transaction",
  "batch_categorize",
  "log_meal",
  "log_water",
  "start_workout",
  "log_set",
  "mark_habit_done",
  "create_habit",
  "set_habit_schedule",
  "pause_habit",
  "morning_briefing",
  "weekly_summary",
  "compare_weeks",
]);

interface CardInput {
  name: string;
  input: Record<string, unknown>;
  result: string;
  failed?: boolean;
}

const FAILURE_RE = /^(Помилка|Невідома дія)/;

function deriveStatus(
  result: string,
  explicitFailed?: boolean,
): ChatActionCardStatus {
  if (explicitFailed) return "failed";
  return FAILURE_RE.test(result) ? "failed" : "completed";
}

function moduleFor(name: string): ChatActionCardModule {
  if (
    name === "create_transaction" ||
    name === "find_transaction" ||
    name === "batch_categorize" ||
    name === "delete_transaction" ||
    name === "hide_transaction" ||
    name === "import_monobank_range"
  ) {
    return "finyk";
  }
  if (name === "log_meal" || name === "log_water") return "nutrition";
  if (name === "start_workout" || name === "log_set") return "fizruk";
  if (
    name === "mark_habit_done" ||
    name === "create_habit" ||
    name === "archive_habit" ||
    name === "set_habit_schedule" ||
    name === "pause_habit"
  ) {
    return "routine";
  }
  return "hub";
}

function iconFor(name: string): string | undefined {
  switch (name) {
    case "create_transaction":
    case "find_transaction":
    case "batch_categorize":
      return "credit-card";
    case "log_meal":
    case "log_water":
      return "utensils";
    case "start_workout":
    case "log_set":
      return "dumbbell";
    case "mark_habit_done":
    case "create_habit":
      return "check";
    case "set_habit_schedule":
      return "calendar";
    case "pause_habit":
      return "pause-circle";
    case "morning_briefing":
      return "sun";
    case "weekly_summary":
    case "compare_weeks":
      return "bar-chart";
    default:
      return undefined;
  }
}

function titleFor(name: string, status: ChatActionCardStatus): string {
  const failedSuffix = status === "failed" ? " — не вийшло" : "";
  switch (name) {
    case "create_transaction":
      return `Транзакцію записано${failedSuffix}`;
    case "find_transaction":
      return `Транзакції знайдено${failedSuffix}`;
    case "batch_categorize":
      return `Категорії оновлено${failedSuffix}`;
    case "log_meal":
      return `Прийом їжі залоговано${failedSuffix}`;
    case "log_water":
      return `Воду залоговано${failedSuffix}`;
    case "start_workout":
      return `Тренування стартувало${failedSuffix}`;
    case "log_set":
      return `Підхід записано${failedSuffix}`;
    case "mark_habit_done":
      return `Звичка виконана${failedSuffix}`;
    case "create_habit":
      return `Звичку створено${failedSuffix}`;
    case "set_habit_schedule":
      return `Розклад звички оновлено${failedSuffix}`;
    case "pause_habit":
      return `Стан паузи звички оновлено${failedSuffix}`;
    case "morning_briefing":
      return `Ранковий брифінг${failedSuffix}`;
    case "weekly_summary":
      return `Тижневий підсумок${failedSuffix}`;
    case "compare_weeks":
      return `Порівняння тижнів${failedSuffix}`;
    default:
      return name;
  }
}

function summaryFor(name: string, input: Record<string, unknown>): string {
  const get = (k: string): string => {
    const v = input[k];
    return typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  };
  switch (name) {
    case "create_transaction": {
      const t = get("type") === "income" ? "Дохід" : "Витрата";
      const amount = get("amount");
      const category = get("category");
      return [t, amount && `${amount} грн`, category]
        .filter(Boolean)
        .join(" · ");
    }
    case "log_meal":
      return get("name") || get("food") || "Прийом їжі";
    case "log_water":
      return `${get("amount") || ""} мл`.trim();
    case "log_set":
      return [get("exercise"), get("reps") && `${get("reps")} повт.`]
        .filter(Boolean)
        .join(" · ");
    case "mark_habit_done":
    case "create_habit":
    case "pause_habit":
      return get("habit") || get("name") || "";
    default:
      return "";
  }
}

let cardCounter = 0;
function newCardId(): string {
  cardCounter += 1;
  return `card_${Date.now()}_${cardCounter}`;
}

export function buildActionCard(input: CardInput): ChatActionCard | null {
  if (!KNOWN_TOOLS.has(input.name)) return null;
  const status = deriveStatus(input.result, input.failed);
  const card: ChatActionCard = {
    id: newCardId(),
    toolName: input.name,
    status,
    title: titleFor(input.name, status),
    summary: summaryFor(input.name, input.input) || input.result,
    module: moduleFor(input.name),
  };
  const icon = iconFor(input.name);
  if (icon) Object.assign(card, { icon });
  if (RISKY_TOOLS.has(input.name)) Object.assign(card, { risky: true });
  return card;
}

/**
 * Маршрут, на який треба перейти при тапі на action-картку. Мобільний
 * клієнт ходить через Expo Router, тож повертаємо рядок-href у
 * форматі, який приймає `router.push()`. `null` означає «нікуди не
 * вести» — UI рендерить картку як read-only summary.
 */
export function deepLinkForCard(
  card: ChatActionCard,
):
  | "/(tabs)/finyk"
  | "/(tabs)/fizruk"
  | "/(tabs)/routine"
  | "/(tabs)/nutrition"
  | "/(tabs)"
  | null {
  switch (card.module) {
    case "finyk":
      return "/(tabs)/finyk";
    case "fizruk":
      return "/(tabs)/fizruk";
    case "routine":
      return "/(tabs)/routine";
    case "nutrition":
      return "/(tabs)/nutrition";
    case "hub":
      return "/(tabs)";
    default:
      return null;
  }
}
