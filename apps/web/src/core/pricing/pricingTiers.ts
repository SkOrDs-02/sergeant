import { FEATURES, type Access, type FeatureId } from "@sergeant/shared";
import type { useLocale } from "@shared/i18n/useLocale";

type PricingMessages = ReturnType<typeof useLocale>["messages"]["pricing"];
type FeatureLabelKey = Exclude<
  keyof PricingMessages["features"],
  "includedSr" | "excludedSr"
>;

export interface Feature {
  readonly label: string;
  /** Підпис ліміту під рядком (тижнева квота Free або «без ліміту»). */
  readonly limit?: string;
  /** `false`: рядок стилізується як «недоступно». */
  readonly included?: boolean;
}

export interface Tier {
  readonly id: "free" | "premium";
  readonly name: string;
  readonly price: string;
  readonly cadence: string;
  readonly tagline: string;
  readonly features: ReadonlyArray<Feature>;
  readonly highlight: boolean;
}

/**
 * Рядки таблиці `/pricing` і їхні підписи. Доступ і ліміти кожного рядка
 * читаються з реєстру `@sergeant/shared` `FEATURES` (спека
 * `docs/work/specs/access-tiers.md`), тож тут лише порядок і текст. Рядки
 * «без AI = ядро» стоять явно, щоб Free не виглядав урізаним.
 */
const PRICING_ROWS: ReadonlyArray<readonly [FeatureId, FeatureLabelKey]> = [
  ["tracking.manual", "manualTracking"],
  ["ai.actions", "aiActions"],
  ["ai.photo", "aiPhotoFoodShort"],
  ["ai.finykVision", "finykVision"],
  ["bank.monoSync", "monoAutoSync"],
  ["sync.cloud", "cloudSync"],
  ["export.csv", "csvExport"],
  ["ai.voice", "voice"],
  ["ai.memoryRecall", "memoryRecall"],
  ["export.pdf", "pdfExport"],
  ["nutrition.weekPlan", "weekPlan"],
];

function freeCell(label: string, access: Access, t: PricingMessages): Feature {
  if (typeof access === "object") {
    return { label, limit: `${access.perWeek}${t.limits.perWeek}` };
  }
  return access ? { label } : { label, included: false };
}

/**
 * Free-колонка показує всі рядки; Premium лише те, що він додає: квотні
 * рядки як «без ліміту» і закриті на Free фічі.
 */
export function buildTiers(t: PricingMessages): ReadonlyArray<Tier> {
  const free: Feature[] = [];
  const premium: Feature[] = [];
  for (const [id, key] of PRICING_ROWS) {
    const label = t.features[key];
    const access: Access = FEATURES[id].free;
    free.push(freeCell(label, access, t));
    if (typeof access === "object") {
      premium.push({ label, limit: t.limits.unlimited });
    } else if (access === false) {
      premium.push({ label });
    }
  }
  return [
    {
      id: "free",
      name: t.tiers.freeName,
      price: t.tiers.freePrice,
      cadence: t.tiers.freeCadence,
      tagline: t.tiers.freeTagline,
      highlight: false,
      features: free,
    },
    {
      id: "premium",
      name: t.tiers.premiumName,
      price: t.tiers.premiumPrice,
      cadence: t.tiers.premiumCadence,
      tagline: t.tiers.premiumTagline,
      highlight: true,
      features: premium,
    },
  ];
}
