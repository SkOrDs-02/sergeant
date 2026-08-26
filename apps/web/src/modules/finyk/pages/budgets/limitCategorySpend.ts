/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * Re-export shim. Імплементація переїхала в
 * `@sergeant/finyk-domain/lib/limitCategorySpend`, коли ліміт став
 * мульти-категорійним і арифметику почали читати Overview та insight-хуки
 * поза цією текою. Історія й AI-DANGER про розходження словників MCC ↔
 * ручної таксономії — у доменному файлі.
 */
export {
  categoryBucketIds,
  calcLimitCategorySpent,
  calcLimitCategoryBreakdown,
  type LimitCategoryInput,
} from "@sergeant/finyk-domain/lib/limitCategorySpend";
