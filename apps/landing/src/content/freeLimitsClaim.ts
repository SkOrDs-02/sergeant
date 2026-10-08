/**
 * Тижневі ліміти безкоштовного плану, як їх називає сайт.
 *
 * До 2026-10-08 /yizha, гайд про фото і /obitsyanky писали, що фото їжі
 * «входить у платний план», хоча Free має кілька фото на тиждень, а
 * `PREMIUM_CLAIM` поруч казав саме про зняття ліміту (аудит сайту 2026-10-08,
 * T7). Числа дзеркалять реєстр доступу `FEATURES` у `@sergeant/shared`;
 * розходження ловить `freeLimitsClaim.test.ts`. Імпорту в рантаймі немає
 * навмисно: реєстр тягне за собою схеми, а сайту потрібні три числа.
 */
export const FREE_LIMITS = {
  aiActions: 20,
  aiPhoto: 3,
  finykVision: 5,
} as const;

export const FREE_LIMITS_CLAIM = `Безкоштовний план має тижневі ліміти: ${FREE_LIMITS.aiActions} дій Сержанта, ${FREE_LIMITS.aiPhoto} фото їжі і ${FREE_LIMITS.finykVision} сканів чеків`;
