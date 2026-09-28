/**
 * F-5: звʼязок, що тримався на модулі, який давно мовчить, каже це прямо.
 *
 * Без цього звʼязок, чий модуль перестав отримувати записи, просто зникав
 * зі стрічки (менше спільних днів), або його тягнуло до нуля структурними
 * нулями, і людина не могла відрізнити «звʼязку не було» від «я перестав
 * записувати». Рішення власника (спека `reward-loop-and-reminders.md`,
 * § Рішення дизайну): пояснити порожнечу, а не питати, чи вимкнути модуль.
 * Це не дорікання, тож копія не каже «ти не записуєш».
 */

import { z } from "zod";
import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadLSValidated, safeWriteLS } from "@shared/lib/storage/storage";

import {
  ABSENCE_MEANS,
  type DailyMetric,
  type DailySeries,
} from "../lib/chatActions/crossActions/dailySeries";
import type { CrossModuleLinkModule } from "./CrossModuleLinkCard";
import { metricModule } from "./crossModuleLinkData";
import {
  WINDOW_DAYS,
  shiftDayKey,
  type NotablePair,
} from "./digestCorrelations";

/**
 * Скільки днів без жодного запису робить модуль «замовклим». Тиждень, бо
 * це найкоротший обрій, на якому продукт узагалі говорить про відсутність
 * (нудж Сержанта будить на 2, 4 і 7 день), і найдовший, за який звʼязок на
 * 60-денному вікні ще не встигає тихо розсипатись.
 */
export const QUIET_AFTER_DAYS = 7;

/** Скільки пояснень показуємо над секцією: більше вже шум. */
const MAX_QUIET = 2;

const RememberedSchema = z.record(
  z.string(),
  z.object({
    a: z.string(),
    b: z.string(),
    phrase: z.string(),
    seenOn: z.string(),
  }),
);

type Remembered = z.infer<typeof RememberedSchema>;

function pairKey(a: string, b: string): string {
  return `${a}|${b}`;
}

/**
 * Запамʼятати звʼязки, помітні сьогодні, і забути ті, які востаннє бачили
 * раніше за вікно аналізу: про них уже нічого сказати не можна.
 */
export function recordNotableLinks(
  pairs: readonly NotablePair[],
  todayKey: string,
): Remembered {
  const stored = safeReadLSValidated<Remembered>(
    STORAGE_KEYS.LINKS_REMEMBERED,
    RememberedSchema,
    {},
  );
  const horizon = shiftDayKey(todayKey, -WINDOW_DAYS);
  const next: Remembered = {};
  for (const [key, link] of Object.entries(stored)) {
    if (link.seenOn >= horizon) next[key] = link;
  }
  for (const p of pairs) {
    next[pairKey(p.a, p.b)] = {
      a: p.a,
      b: p.b,
      phrase: p.phrase,
      seenOn: todayKey,
    };
  }
  if (JSON.stringify(next) !== JSON.stringify(stored)) {
    safeWriteLS(STORAGE_KEYS.LINKS_REMEMBERED, next);
  }
  return next;
}

/**
 * Останній день, коли метрика мала запис. Структурний нуль записом не є:
 * для витрат чи тренувань день без руху заповнюється нулем, і саме тому
 * «замовклий» модуль там не зменшує `n`, а тихо тягне кореляцію.
 */
export function lastActiveDay(
  series: DailySeries,
  metric: DailyMetric,
): string | null {
  const col = series.raw[metric];
  if (!col) return null;
  const zeroIsSilence = ABSENCE_MEANS[metric] !== "unknown";
  for (let i = col.length - 1; i >= 0; i -= 1) {
    const value = col[i];
    if (value === undefined) continue;
    if (zeroIsSilence && value === 0) continue;
    return series.days[i] ?? null;
  }
  return null;
}

export interface QuietLink {
  phrase: string;
  module: CrossModuleLinkModule;
  /** Останній день із записом у вікні, або `null`, якщо у вікні записів нема. */
  since: string | null;
}

/**
 * Звʼязки, які вже бували помітними, зараз ні, і причина видна: один із
 * модулів тиждень і довше без записів. Звʼязок, що ослаб при живих обох
 * модулях, сюди не потрапляє: це вже не мовчання, а відповідь даних.
 */
export function quietLinks(
  series: DailySeries,
  current: readonly NotablePair[],
  remembered: Remembered,
): QuietLink[] {
  const now = new Set(current.map((p) => pairKey(p.a, p.b)));
  const cutoff = shiftDayKey(series.to, -QUIET_AFTER_DAYS);
  const out: QuietLink[] = [];
  for (const [key, link] of Object.entries(remembered)) {
    if (now.has(key)) continue;
    // Памʼять переживає зміну набору метрик: пару, якої в поточних рядах
    // нема, пояснити нічим, і «немає записів» про неї було б неправдою.
    const metrics = [link.a, link.b];
    if (!metrics.every((m) => m in series.raw)) continue;
    for (const metric of metrics as DailyMetric[]) {
      const last = lastActiveDay(series, metric);
      if (last === null || last <= cutoff) {
        out.push({
          phrase: link.phrase,
          module: metricModule(metric),
          since: last,
        });
        break;
      }
    }
    if (out.length >= MAX_QUIET) break;
  }
  return out;
}
