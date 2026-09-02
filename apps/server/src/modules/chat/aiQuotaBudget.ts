import type { Request } from "express";
import { kyivMondayStartMs, toLocalISODate } from "@sergeant/shared";

import { logger } from "../../obs/logger.js";
import { isChatPreset } from "./chatPresets.js";

import type { ChatPreset } from "@sergeant/shared";

/**
 * Резолв денного/тижневого бюджету для AI-квоти.
 *
 * Винесено з `aiQuota.ts` окремим модулем через Hard Rule #18 (max-lines
 * 600): додавання preset-відра підняло той файл до 623 рядків коду.
 * Модуль-лист — імпортує лише `chatPresets` і shared-утиліти, тож циклу з
 * `aiQuota.ts` немає.
 */

// ── Preset-бюджет (окреме відро для сценарних режимів) ──────────────
//
// AI-CONTEXT: онбординг-інтервʼю памʼяті («Заповнити профіль») не влазило у
// Free-ліміт. Спершу порахували так: 5 запитів на добу, і кожен тур із
// tool-call-ом коштував ДВА HTTP-запити (перший + синтез після `remember`,
// обидва проходили `assertAiQuota`) — інтервʼю на 4 обміни ≈ 8 запитів, і
// новий користувач упирався в paywall посеред онбордингу, з половиною
// незбережених фактів.
//
// AI-5 рішення 1 (`docs/90-work/audits/2026-09-01-product-audit/findings.md`,
// 2026-09-01) закрило подвійне списання: другий запит того самого ходу
// проходить за round-trip-квитком (`chatRoundTripTicket.ts`) і не списує
// нового квитка з ЖОДНОГО відра — ні денного, ні preset-ного. Ліміти нижче
// (10/4) від цього НЕ зменшили: вони й так уже враховували запас на повтор,
// тож після фіксу відро просто стало щедрішим, ніж мінімально потрібно —
// це не борг, звужувати немає причини.
//
// Рішення — не виняток із ліміту, а власне відро: сценарій не чіпає денні 5,
// але й не безмежний. Вікно ТИЖНЕВЕ (`usage_day` = понеділок київського
// тижня), бо профіль заповнюють раз, а не щодня. Колонка лишається `DATE`,
// міграція не потрібна.
//
// Стеля зловживання. `preset` приходить від клієнта, і перевірити намір
// сервер не може — будь-хто причепить його до звичайного запиту й обслужиться
// звідси. Тижневе вікно і є обмеженням масштабу: +limit на тиждень замість
// +limit на добу. Лічильник — ПЕР-PRESET (`preset:<name>`), а не спільний:
// `profile_add_info` повторюють тижнями, і спільний бюджет означав би, що
// після інтервʼю людина до кінця тижня не додасть жодного факту. Тож сумарна
// стеля = сума лімітів усіх preset-ів; додаєш новий — перерахуй її
// (`docs/04-governance/security/ai-quota-kill-switch.md § preset-відро`).
//
// Другий бік цієї оборони живе не тут: `OFF_TOPIC_RULE` у `chatPresets.ts`
// наказує моделі не виконувати сторонні запити всередині режиму. Лічильник
// обмежує масштаб трюку, правило — прибирає його сенс.
const PRESET_BUCKET_PREFIX = "preset:";

/**
 * Вбудовані тижневі ліміти — по одному на сценарій, бо їхні профілі
 * використання різні:
 *
 *   * `profile_interview` — ≤4 повідомлення асистента, кожне тепер (AI-5
 *     рішення 1) списує РІВНО один квиток за хід незалежно від того, чи
 *     хід ніс tool-call — 4 + запас на повтор;
 *   * `profile_add_info` — один-два обміни за раз, але дію повторюють
 *     протягом тижня.
 *
 * Спільної константи тут навмисно немає: одне число на всі режими робило
 * сумарну стелю (12 × N) більшою, ніж потрібно кожному з них окремо.
 */
const DEFAULT_PRESET_WEEKLY_LIMITS: Record<ChatPreset, number> = {
  profile_interview: 10,
  profile_add_info: 4,
};

export interface QuotaBudget {
  bucket: string;
  day: string;
  limit: number;
}

export function parseLimit<F extends number | null>(
  name: string,
  fallback: F,
): number | F {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Понеділок поточного київського тижня — ключ вікна для preset-відра. */
function thisWeek(): string {
  return toLocalISODate(kyivMondayStartMs());
}

/**
 * Per-preset ліміт із JSON-мапи `AI_QUOTA_PRESET_LIMITS`
 * (`{"profile_interview":10,"profile_add_info":4}`). `undefined` — ключа
 * немає або значення невалідне; битий JSON — fail-open + warn, як у
 * `toolLimit()`: advisory-налаштування не має класти запити.
 */
function presetLimitFromMap(preset: ChatPreset): number | undefined {
  const raw = process.env["AI_QUOTA_PRESET_LIMITS"];
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object" && preset in parsed) {
      const v = parsed[preset];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    }
  } catch (e: unknown) {
    logger.warn({
      msg: "ai_quota_preset_limits_parse_failed",
      err: { message: (e as Error)?.message || String(e) },
    });
  }
  return undefined;
}

/**
 * Тижневий ліміт відра для конкретного сценарію (в одиницях квоти).
 *
 * Precedence — дзеркало `toolLimit()`:
 *   1. `AI_QUOTA_PRESET_LIMITS[preset]` — точкове налаштування одного режиму;
 *   2. `AI_QUOTA_PRESET_WEEKLY_LIMIT` — одне число на ВСІ режими (глобальний
 *      важіль; `0` вимикає сценарні режими цілком);
 *   3. вбудований per-preset дефолт.
 *
 * Завжди число: «безлімітного» варіанту тут немає навмисно — відро існує
 * саме як стеля, і зняти її означало б віддати сценарний режим без обмежень.
 */
function presetWeeklyLimit(preset: ChatPreset): number {
  const fromMap = presetLimitFromMap(preset);
  if (fromMap !== undefined) return fromMap;
  const global = parseLimit("AI_QUOTA_PRESET_WEEKLY_LIMIT", null);
  if (global !== null) return global;
  return DEFAULT_PRESET_WEEKLY_LIMITS[preset];
}

/**
 * Власне відро сценарного preset-а — або `null`, якщо запит звичайний.
 *
 * `req.body` читається сирим: `assertAiQuota` стоїть ДО `parseBody` у
 * handler-і, тож типізованого preset-а тут ще немає. `isChatPreset` звужує
 * до enum-у, тому підсунути довільний рядок і створити собі нове відро не
 * вийде — невідоме значення просто падає у звичайний денний бюджет.
 *
 * Ліміт береться per-preset (`presetWeeklyLimit`), тож режими не діляться
 * спільним бюджетом і не гасять один одного.
 */
export function resolvePresetBudget(req: Request): QuotaBudget | null {
  const preset = (req.body as { preset?: unknown } | undefined)?.preset;
  if (!isChatPreset(preset)) return null;
  return {
    bucket: `${PRESET_BUCKET_PREFIX}${preset}`,
    day: thisWeek(),
    limit: presetWeeklyLimit(preset),
  };
}
