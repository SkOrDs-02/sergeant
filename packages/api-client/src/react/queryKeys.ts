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
    all: ["me"] as const,
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
    all: ["weekly-digest"] as const,
    byWeek: (weekKey: string) => ["weekly-digest", weekKey] as const,
    history: ["weekly-digest", "history"] as const,
  },
  push: {
    all: ["push"] as const,
    vapidPublic: () => ["push", "vapid-public"] as const,
  },
  foodSearch: {
    all: ["food-search"] as const,
    query: (q: string) => ["food-search", q] as const,
  },
  barcode: {
    all: ["barcode"] as const,
    lookup: (barcode: string) => ["barcode", barcode] as const,
  },
  privat: {
    all: ["privat"] as const,
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
    all: ["push"] as const,
    register: () => ["push", "register"] as const,
    test: () => ["push", "test"] as const,
    unregister: () => ["push", "unregister"] as const,
  },
} as const;
