/**
 * Централізовані query-keys для React Query хуків `@sergeant/api-client/react`.
 *
 * Правило: ключі групуються по модулю (perfy.all, coach.all, …). Кожен
 * «list-подібний» ключ повертає масив `readonly [namespace, subResource, ...args]`,
 * щоб можна було робити `queryClient.invalidateQueries({ queryKey: ['coach'] })`
 * для інвалідації цілого підпростору.
 */
export const apiQueryKeys = {
  me: {
    current: () => ["me", "current"] as const,
  },
  coach: {
    all: ["coach"] as const,
    memory: () => ["coach", "memory"] as const,
    /** Денний кеш `useCoachInsight` (web + mobile). */
    insight: (dateKey: string) => ["coach", "insight", dateKey] as const,
  },
  /** Кеш тижневого дайджеста після генерації. */
  weeklyDigest: {
    byWeek: (weekKey: string) => ["weekly-digest", weekKey] as const,
    history: ["weekly-digest", "history"] as const,
  },
  // Домен і форма кортежу — ті самі, що в канонічній web-фабриці
  // (`apps/web/src/shared/lib/api/queryKeys.ts`, Hard Rule #2), щоб один
  // ключ не інвалідовував/кешував паралельно з іншим (`push`/`vapid`,
  // `nutrition`/`food-search`).
  push: {
    vapidPublic: () => ["push", "vapid"] as const,
  },
  foodSearch: {
    query: (q: string) => ["nutrition", "food-search", q] as const,
  },
  barcode: {
    lookup: (barcode: string) => ["barcode", barcode] as const,
  },
  privat: {
    balanceFinal: (merchantId: string) =>
      ["privat", "balance-final", merchantId] as const,
  },
} as const;

/**
 * Централізовані mutation-keys для React Query хуків
 * `@sergeant/api-client/react`. Живуть поруч з `apiQueryKeys`, щоб кожна
 * мутація мала стабільний ключ (для `useIsMutating`, `queryClient.cancelMutations`
 * та консистентного інспектування у Devtools).
 */
export const apiMutationKeys = {
  push: {
    register: () => ["push", "register"] as const,
    test: () => ["push", "test"] as const,
    unregister: () => ["push", "unregister"] as const,
  },
  nutrition: {
    /** AI-рекомендації рецептів (`/api/nutrition/recommend-recipes`). */
    recommendRecipes: () => ["nutrition", "recommend-recipes"] as const,
  },
} as const;
