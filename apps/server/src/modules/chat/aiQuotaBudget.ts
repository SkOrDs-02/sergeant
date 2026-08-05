import type { Request } from "express";
import { kyivMondayStartMs, toLocalISODate } from "@sergeant/shared";

import { isChatPreset } from "./chatPresets.js";

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
// Free-ліміт. Порахуй: 5 запитів на добу, і КОЖЕН тур їх їсть — тур із
// tool-call-ом коштує два (перший запит + синтез після `remember`, обидва
// проходять `assertAiQuota`). Тобто інтервʼю на 4 обміни ≈ 8 запитів, і
// новий користувач упирався в paywall посеред онбордингу, з половиною
// незбережених фактів.
//
// Рішення — не виняток із ліміту, а власне відро: сценарій не чіпає денні 5,
// але й не безмежний. Вікно ТИЖНЕВЕ (`usage_day` = понеділок київського
// тижня), бо профіль заповнюють раз, а не щодня: стеля зловживання —
// +N запитів на тиждень, а не на добу. Колонка лишається `DATE`, міграція
// не потрібна.
const PRESET_BUCKET_PREFIX = "preset:";

// ≤4 повідомлення асистента × 2 запити на тур + запас на один повтор.
const DEFAULT_PRESET_WEEKLY_LIMIT = 12;

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

/** Тижневий ліміт preset-відра (в одиницях квоти), env-tunable. */
function presetWeeklyLimit(): number | null {
  return parseLimit(
    "AI_QUOTA_PRESET_WEEKLY_LIMIT",
    DEFAULT_PRESET_WEEKLY_LIMIT,
  );
}

/**
 * Власне відро сценарного preset-а — або `null`, якщо запит звичайний.
 *
 * `req.body` читається сирим: `assertAiQuota` стоїть ДО `parseBody` у
 * handler-і, тож типізованого preset-а тут ще немає. `isChatPreset` звужує
 * до enum-у, тому підсунути довільний рядок і створити собі нове відро не
 * вийде — невідоме значення просто падає у звичайний денний бюджет.
 *
 * `presetWeeklyLimit() == null` (env явно знімає ліміт) → теж `null`, тобто
 * сценарій рахується у звичайному денному відрі. Це навмисно консервативно:
 * «нема ліміту на відро» не має означати «нема ліміту зовсім».
 */
export function resolvePresetBudget(req: Request): QuotaBudget | null {
  const preset = (req.body as { preset?: unknown } | undefined)?.preset;
  if (!isChatPreset(preset)) return null;
  const limit = presetWeeklyLimit();
  if (limit == null) return null;
  return {
    bucket: `${PRESET_BUCKET_PREFIX}${preset}`,
    day: thisWeek(),
    limit,
  };
}
