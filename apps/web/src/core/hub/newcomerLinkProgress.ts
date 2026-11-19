/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Справжній прогрес рядка «Звʼязки між сферами» картки «Що зʼявиться і
 * коли» (В-1 → (Б), рішення founder-а 2026-11-18, спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`).
 *
 * Ті самі ряди й ті самі правила, що в секції звʼязків на `/insights`
 * (`CrossModuleLinksSection`): вікно `buildCrossModuleSeries`, помітні пари
 * `notablePairsFromSeries`, спільні дні — найближча до порога крос-модульна
 * курована пара (`closestCrossModulePair`). Іншої арифметики тут немає,
 * тож хаб і `/insights` не розійдуться в числі.
 *
 * AI-NOTE: модуль тягне ряди метрик усіх модулів і повний каталог копії
 * (`crossModuleLinkData`), тому хаб вантажить його лише динамічним
 * `import()` (`useNewcomerLinkProgress`): `HubDashboard` eager, а бюджет
 * eager-бандла тісний.
 */
import type { DailySeries } from "../lib/chatActions/crossActions/dailySeries";
import {
  buildCrossModuleSeries,
  notablePairsFromSeries,
} from "../insights/digestCorrelations";
import { closestCrossModulePair } from "../insights/crossModuleLinkData";

export interface NewcomerLinkProgress {
  /** Спільні дні найближчої до порога крос-модульної пари. */
  sharedDays: number;
  /** Знайдено хоч один помітний звʼязок: картка свою роботу зробила. */
  linkFound: boolean;
}

export function newcomerLinkProgressFromSeries(
  series: DailySeries,
): NewcomerLinkProgress {
  return {
    sharedDays: closestCrossModulePair(series)?.n ?? 0,
    linkFound: notablePairsFromSeries(series).length > 0,
  };
}

export function readNewcomerLinkProgress(
  now: number = Date.now(),
): NewcomerLinkProgress {
  return newcomerLinkProgressFromSeries(buildCrossModuleSeries(now));
}
