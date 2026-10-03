/**
 * Status: Active
 *
 * Гейт «дані про здоровʼя → модель» для `/api/chat` (GDPR Art. 9(2)(a)).
 * Джерело правди — збережена `healthDataConsent` (`lib/healthConsent.ts`);
 * клієнтський прапорець ніколи не вирішує, це лише UX.
 *
 * Дані до моделі йдуть трьома шляхами, і кожен закритий окремо:
 *   1. КОНТЕКСТ — клієнтський знімок (`stripHealthContext`) плюс серверні
 *      добавки першого туру (RAG у `ai-memory/service.ts`, кореляції у
 *      `coach.ts`);
 *   2. TOOLS — health-only tools не в payload (`tools.ts::filterToolsByHealthConsent`);
 *   3. TOOL_RESULTS — round-trip: те, що клієнт виконав, до моделі
 *      не доходить (`redactHealthToolResults`), а `tool_use`-вхід у відтвореній
 *      історії обнуляється (`redactHealthToolCalls`).
 *
 * AI-DANGER: клієнтський `context` — плоский рядок, тож `stripHealthContext`
 * тримається на префіксах секцій, які пише `apps/web/src/core/lib/
 * hubChatContext/sections.ts`. Зміниш назву секції там — онови регекси тут
 * (тест `healthGate.test.ts` фіксує поточні рядки). Те, що людина сама
 * НАБРАЛА в повідомленні (`messages`), не фільтрується: вирізати «я сьогодні
 * важив 80 кг» із вільного тексту без класифікатора неможливо, і
 * `privacyDocument.ts` каже це прямо.
 */

import { HEALTH_CONSENT_REQUIRED_MESSAGE } from "@sergeant/shared";
import { HEALTH_ONLY_TOOL_NAMES } from "./tools.js";
import type { CoachMemory, CoachSnapshot } from "./coach.js";

/**
 * Текст-замінник `tool_result` (і те, що модель має донести людині). Це
 * САМЕ копія з `@sergeant/shared`, а не власна: сервер і web показують одне.
 */
export const HEALTH_CONSENT_TOOL_NOTICE = HEALTH_CONSENT_REQUIRED_MESSAGE;

/**
 * Інструкція моделі, коли згоди немає (`buildSystem`, після cached-префікса).
 * Наш власний текст, тож без `<user_data>`-огорожі.
 */
export const HEALTH_CONSENT_SYSTEM_NOTE = [
  "ЗГОДА НА ДАНІ ПРО ЗДОРОВʼЯ: користувач її НЕ надав.",
  "Тренування, вага, заміри, самопочуття, харчування, калорії й фото страв тобі недоступні: їх немає в контексті навмисно, а відповідні інструменти вимкнено.",
  "Якщо користувач питає про це або просить щось записати, не вгадуй і не вигадуй дані. Скажи одним-двома реченнями, на «ти»: для цього потрібна згода на дані про здоровʼя, і вмикається вона в Налаштування → Дані та приватність.",
  "Фінанси, звички й решту роби як завжди.",
].join("\n");

const HEALTH_SECTION_TAG =
  /^\[(?:Тренування|Фізрук[^\]]*|Останнє тренування вправи|Харчування[^\]]*)\]/;
const HEALTH_MODULE_SUFFIX = /\(модуль:\s*(?:fizruk|nutrition)\)\s*$/;
const INSIGHTS_HEADING = /^\[Аналітичні інсайти\]/;
// Категорія профілю «Здоровʼя» (`memoryBank.ts`): апостроф може бути U+02BC
// або звичайним, тож `.`.
const PROFILE_HEALTH_LINE = /^\s+Здоров.я:/;
const PROFILE_HEALTH_ENTRY = /\[Здоров.я\]/;

/**
 * Прибирає з клієнтського знімка секції про здоровʼя: тренування, харчування,
 * рекомендації модулів fizruk/nutrition, категорію профілю «Здоровʼя» і всю
 * секцію інсайтів (вона крос-модульна: день тренувань, калорії проти звичок).
 */
export function stripHealthContext(context: string): string {
  if (!context) return context;
  const out: string[] = [];
  let inInsights = false;
  for (const line of context.split("\n")) {
    if (INSIGHTS_HEADING.test(line)) {
      inInsights = true;
      continue;
    }
    if (inInsights) {
      // Елементи секції — відступні рядки; перший не-відступний завершує її.
      if (/^\s/.test(line)) continue;
      inInsights = false;
    }
    if (HEALTH_SECTION_TAG.test(line)) continue;
    if (HEALTH_MODULE_SUFFIX.test(line)) continue;
    if (PROFILE_HEALTH_LINE.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

const HEALTH_DAILY_METRICS = new Set([
  "kcal",
  "protein",
  "water",
  "workout_volume",
  "workouts",
  "weight",
  "wellbeing",
]);

// Рядки `morning_briefing` / `weekly_summary`
// (`chatActions/crossActions/briefingHandlers.ts`), що несуть health.
// `\b` тут не годиться: у JS він не бачить кирилицю як «слово».
const BRIEFING_HEALTH_LINE =
  /^(?:Заплановано тренувань|Калорії|Тренувань|Обʼєм)(?::|\s|$)/;

type ToolVerdict = "block" | "filter-lines" | "pass";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/**
 * Що робити з викликом за його імʼям і входом. Змішані крос-модульні tools
 * розбираємо за параметрами: `get_daily_series` без health-метрик — це
 * фінанси/звички, і чат без згоди має їх зберегти.
 */
function classifyToolUse(name: string, rawInput: unknown): ToolVerdict {
  if (HEALTH_ONLY_TOOL_NAMES.has(name)) return "block";
  const input = asRecord(rawInput);
  switch (name) {
    case "get_daily_series": {
      const metrics = input["metrics"];
      if (!Array.isArray(metrics)) return "block";
      return metrics.some(
        (m) => typeof m === "string" && HEALTH_DAILY_METRICS.has(m),
      )
        ? "block"
        : "pass";
    }
    case "habit_correlation":
      return input["against"] === "workouts" ? "block" : "pass";
    case "compare_weeks": {
      const modules = input["modules"];
      // Порожній/відсутній список = «усі 4» на клієнті, тобто з health.
      if (!Array.isArray(modules) || modules.length === 0) return "block";
      return modules.some((m) => m === "fizruk" || m === "nutrition")
        ? "block"
        : "pass";
    }
    case "export_module_data": {
      const mod = String(input["module"] ?? "")
        .toLowerCase()
        .trim();
      return mod === "fizruk" || mod === "nutrition" ? "block" : "pass";
    }
    case "remember":
      return input["category"] === "health" ? "block" : "pass";
    case "my_profile": {
      const cat = String(input["category"] ?? "")
        .toLowerCase()
        .trim();
      return cat === "health" ? "block" : "filter-lines";
    }
    case "morning_briefing":
    case "weekly_summary":
      return "filter-lines";
    default:
      return "pass";
  }
}

function filterHealthLines(name: string, text: string): string {
  const drop =
    name === "my_profile"
      ? (l: string) => PROFILE_HEALTH_ENTRY.test(l)
      : (l: string) => BRIEFING_HEALTH_LINE.test(l);
  return text
    .split("\n")
    .filter((l) => !drop(l))
    .join("\n");
}

interface ToolUseLike {
  id: string;
  name: string;
  input?: unknown;
}

function collectToolUses(
  toolCallsRaw: ReadonlyArray<unknown>,
): Map<string, ToolUseLike> {
  const map = new Map<string, ToolUseLike>();
  for (const b of toolCallsRaw) {
    const block = asRecord(b);
    if (
      block["type"] === "tool_use" &&
      typeof block["id"] === "string" &&
      typeof block["name"] === "string"
    ) {
      map.set(block["id"], {
        id: block["id"],
        name: block["name"],
        input: block["input"],
      });
    }
  }
  return map;
}

/**
 * Round-trip без згоди: замінює `content` health-результатів текстом-дією
 * (`HEALTH_CONSENT_TOOL_NOTICE`), а в змішаних вирізає health-рядки. Мапінг
 * `tool_use_id → tool` береться з `tool_calls_raw`, який уже пройшов
 * провенанс-перевірку (`validateToolCallsRawProvenance`). Вхід не мутується.
 */
export function redactHealthToolResults<
  R extends { tool_use_id: string; content?: unknown },
>(toolResults: ReadonlyArray<R>, toolCallsRaw: ReadonlyArray<unknown>): R[] {
  const uses = collectToolUses(toolCallsRaw);
  return toolResults.map((r) => {
    const use = uses.get(r.tool_use_id);
    if (!use) return r;
    const verdict = classifyToolUse(use.name, use.input);
    if (verdict === "pass") return r;
    if (verdict === "block") {
      return { ...r, content: HEALTH_CONSENT_TOOL_NOTICE };
    }
    return typeof r.content === "string"
      ? { ...r, content: filterHealthLines(use.name, r.content) }
      : r;
  });
}

/**
 * Обнуляє `input` health-`tool_use`, який їде назад у модель у відтвореній
 * асистентській репліці: аргументи `log_meal`/`log_weight` — це ті самі
 * дані, які ми щойно не віддали через `tool_result`.
 */
export function redactHealthToolCalls(
  toolCallsRaw: ReadonlyArray<unknown>,
): unknown[] {
  return toolCallsRaw.map((b) => {
    const block = asRecord(b);
    if (
      block["type"] === "tool_use" &&
      typeof block["name"] === "string" &&
      classifyToolUse(block["name"], block["input"]) === "block"
    ) {
      return { ...block, input: {} };
    }
    return b;
  });
}

/**
 * Коуч без згоди: знімок і памʼять без Фізрука/Харчування, кореляції
 * (крос-модульні, зшивають health з рештою) скинуті. Фінанси й звички
 * лишаються — повідомлення дня не ламається, лише вужчає. Вхід не мутується.
 */
export function stripHealthFromCoachInput(input: {
  snapshot: CoachSnapshot;
  memory: CoachMemory | null;
}): { snapshot: CoachSnapshot; memory: CoachMemory | null } {
  const {
    fizruk: _fizruk,
    nutrition: _nutrition,
    ...snapshot
  } = input.snapshot ?? {};
  const memory = input.memory
    ? {
        ...input.memory,
        weeklyDigests: Array.isArray(input.memory.weeklyDigests)
          ? input.memory.weeklyDigests.map((d) => ({
              ...d,
              fizruk: null,
              nutrition: null,
              correlations: [],
            }))
          : input.memory.weeklyDigests,
      }
    : null;
  return { snapshot, memory };
}
