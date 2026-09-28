/**
 * Єдиний реєстр доступу Free / Premium (спека `docs/work/specs/access-tiers.md`).
 *
 * AI-CONTEXT: до цього файла список фіч жив у трьох копіях, які розійшлися:
 * серверні ліміти (`effectiveLimits.ts`), web-гейти (`premiumFeatures.ts`) і
 * таблиця `/pricing`. Тепер сервер гейтить і рахує квоти звідси, web читає
 * готовий знімок з `/api/billing/status`, а `/pricing` будує таблицю з цього
 * ж обʼєкта. Зміна пакетування = зміна тут плюс ADR, а не правка в трьох
 * місцях.
 */
import { kyivMondayStartMs, toKyivISODate } from "../utils/date";

/** `true` = доступ без ліміту, `false` = недоступно, `perWeek` = тижнева квота. */
export type Access = boolean | { perWeek: number };

/** Аналітична поверхня `paywall_viewed.surface`. */
export type PaywallSurface =
  | "ai_chat_limit"
  | "csv_export"
  | "unlimited_ai_photo"
  | "week_plan"
  | "finyk_vision";

/** Лічильники, які сервер віддає в знімку доступу. */
export type MeterId = "aiActions" | "aiPhoto" | "finykVision";

export interface FeatureSpec {
  free: Access;
  pro: Access;
  surface?: PaywallSurface;
  meter?: MeterId;
}

export const FEATURES = {
  "ai.actions": {
    free: { perWeek: 20 },
    pro: true,
    surface: "ai_chat_limit",
    meter: "aiActions",
  },
  "ai.photo": {
    free: { perWeek: 3 },
    pro: true,
    surface: "unlimited_ai_photo",
    meter: "aiPhoto",
  },
  "ai.finykVision": {
    free: { perWeek: 5 },
    pro: true,
    surface: "finyk_vision",
    meter: "finykVision",
  },
  "ai.voice": { free: false, pro: true },
  // Перегляд і стирання фактів лишаються Free (GDPR); гейт лише на recall.
  "ai.memoryRecall": { free: false, pro: true },
  // Id зарезервований, гейт не вішається: серверної проактивності немає.
  "ai.proactive": { free: false, pro: true },
  "export.pdf": { free: false, pro: true, surface: "csv_export" },
  "export.csv": { free: true, pro: true },
  "bank.monoSync": { free: true, pro: true },
  "sync.cloud": { free: true, pro: true },
  "nutrition.weekPlan": { free: false, pro: true, surface: "week_plan" },
  // Денний план, рецепти, список покупок і розбір комори: 1 дія з `ai.actions`.
  "nutrition.dayPlan": { free: true, pro: true },
  "nutrition.barcode": { free: true, pro: true },
  "finyk.receiptQr": { free: true, pro: true },
  "finyk.importCsv": { free: true, pro: true },
  "finyk.analyticsHistory": { free: true, pro: true },
  "insights.weeklyDigest": { free: true, pro: true },
  "tracking.manual": { free: true, pro: true },
  "fizruk.importStrong": { free: true, pro: true },
  "integrations.silpo": { free: true, pro: true },
} as const satisfies Record<string, FeatureSpec>;

export type FeatureId = keyof typeof FEATURES;

export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];

/** Фічі, для яких існує пейвол у web (мають `surface`). */
export type PaywalledFeatureId = {
  [K in FeatureId]: (typeof FEATURES)[K] extends { surface: PaywallSurface }
    ? K
    : never;
}[FeatureId];

export const PAYWALLED_FEATURE_IDS = FEATURE_IDS.filter(
  (id) => "surface" in FEATURES[id],
) as PaywalledFeatureId[];

export type PlanTier = "free" | "pro";

/** Чи відкрита фіча для плану взагалі (квотні фічі на Free відкриті). */
export function hasFeature(tier: PlanTier, id: FeatureId): boolean {
  return FEATURES[id][tier] !== false;
}

/** Тижневий ліміт фічі для плану; `null` = без ліміту або фіча не квотна. */
export function weeklyLimit(tier: PlanTier, id: FeatureId): number | null {
  const access: Access = FEATURES[id][tier];
  return typeof access === "object" ? access.perWeek : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Дата понеділка ISO-тижня за Europe/Kyiv (`YYYY-MM-DD`). Ключ тижневого
 * відра квоти: пишеться в колонку `ai_usage_daily.usage_day`.
 */
export function weekStartKyiv(d: Date | number | string = Date.now()): string {
  return toKyivISODate(kyivMondayStartMs(d));
}

/** Мить скидання тижневих лічильників: наступний понеділок 00:00 Kyiv. */
export function nextWeekStartKyivMs(
  d: Date | number | string = Date.now(),
): number {
  // Четвер наступного тижня лежить далеко від будь-якої DST-межі.
  return kyivMondayStartMs(kyivMondayStartMs(d) + 10 * DAY_MS);
}
