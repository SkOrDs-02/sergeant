import type { ModuleAccent } from "@sergeant/design-tokens";

/**
 * Централізовані ключі для @tanstack/react-query.
 *
 * Конвенції:
 *  - Ключ — це tuple виду `[domain, resource, ...params] as const`.
 *  - Перший елемент — домен (збігається з назвою модуля чи core-фічі).
 *  - Порядок параметрів — від найширшого до найвужчого, щоб
 *    `invalidateQueries({ queryKey: xxxKeys.all })` знижував усе дерево.
 *  - Секрети (токени) ніколи не вставляємо в ключ — хешуємо їх через
 *    `hashToken` (перші 8 символів SHA-256) перед використанням.
 *  - Усі keys-обʼєкти експортуємо `as const`, щоб TypeScript виводив
 *    літеральні тупли й `setQueryData`/`invalidateQueries` лишались типобезпечними.
 *
 * Якщо додаєш новий `useQuery`/`useMutation` — заведи ключ тут,
 * не генеруй його інлайново в хуці.
 */

// ─── Coach ────────────────────────────────────────────────────────────────
export const coachKeys = {
  all: ["coach"] as const,
  insight: (dayKey: string) => ["coach", "insight", dayKey] as const,
};

// ─── Weekly digest ────────────────────────────────────────────────────────
export const digestKeys = {
  all: ["weekly-digest"] as const,
  history: ["weekly-digest", "history"] as const,
  byWeek: (weekKey: string) => ["weekly-digest", weekKey] as const,
};

// ─── Nutrition ────────────────────────────────────────────────────────────
export const nutritionKeys = {
  all: ["nutrition"] as const,

  // Food search
  foodSearch: ["nutrition", "food-search"] as const,
  foodSearchLocal: (q: string) =>
    ["nutrition", "food-search", "local", q] as const,
  foodSearchOff: (q: string) => ["nutrition", "food-search", "off", q] as const,

  // Barcode lookup (shared between meal-sheet and pantry scan)
  barcode: (code: string) => ["nutrition", "barcode", code] as const,

  // Push subscription status
  pushStatus: ["nutrition", "push-status"] as const,
};

// ─── Finyk ────────────────────────────────────────────────────────────────
export const finykKeys = {
  all: ["finyk"] as const,

  // Proactive AI advice — month-bucketed per limit-budget category set
  // (`limitBudgetCategoryKey`: одна категорія — її id, комбо — sorted join "+")
  proactiveAdvice: (monthKey: string, categoryKey: string) =>
    ["finyk", "proactive-advice", monthKey, categoryKey] as const,

  // Monobank read endpoints
  mono: ["finyk", "mono"] as const,
  monoClientInfo: (tokenHash: string) =>
    ["finyk", "mono", "client-info", tokenHash] as const,
  /** Префікс для всіх statement-ключів — зручно для bulk-invalidate/remove. */
  monoStatements: ["finyk", "mono", "statement"] as const,
  monoStatement: (accId: string, from: number, to: number) =>
    ["finyk", "mono", "statement", accId, from, to] as const,

  // DB-backed webhook endpoints (Track B + Track C)
  monoSyncState: ["finyk", "mono", "sync-state"] as const,
  monoBackfillProgress: ["finyk", "mono", "backfill-progress"] as const,
  monoAccounts: ["finyk", "mono", "accounts"] as const,
  monoTransactionsDb: (
    from: string | undefined,
    to: string | undefined,
    accountId: string | undefined,
  ) => ["finyk", "mono", "transactions-db", from, to, accountId] as const,
  monoWebhookAccounts: ["finyk", "mono", "webhook-accounts"] as const,
  monoWebhookJars: ["finyk", "mono", "webhook-jars"] as const,
  monoWebhookTransactions: (params?: string) =>
    ["finyk", "mono", "webhook-tx", params ?? "all"] as const,
  /**
   * Prefix over every `monoWebhookTransactions(...)` bucket — the 3-element
   * head shared by all date-bounded keys. Use with `findAll`/`removeQueries`
   * to match every webhook-tx cache entry regardless of its `params` tail.
   */
  monoWebhookTransactionsPrefix: ["finyk", "mono", "webhook-tx"] as const,

  // Privatbank read endpoints
  privat: ["finyk", "privat"] as const,
  privatAccounts: (idHash: string) =>
    ["finyk", "privat", "accounts", idHash] as const,
  privatStatement: (idHash: string, accId: string, from: string, to: string) =>
    ["finyk", "privat", "statement", idHash, accId, from, to] as const,

  // Receipt scan (docs/90-work/planning/specs/receipt-scan.md § Web UI).
  // `lookupReceipt`/`analyzeReceipt`/`saveReceipt` are mutations (no cache
  // key needed) — only the by-id GET used for the transaction drill-down
  // is cached here.
  receipt: (id: number) => ["finyk", "receipt", id] as const,

  // Bulk import batches (spec § Фаза 2 — Масове ведення). `commitImport`/
  // `analyzeImportScreenshot`/`previewImportStatement` are mutations;
  // `getImportBatch` (undo-summary re-read) is the only cached GET.
  importBatch: (id: number) => ["finyk", "import-batch", id] as const,

  // Дати останніх імпортів по кожному типу документа — джерело фактів для
  // плашки «залий документи». Інвалідується після успішного commit-у, щоб
  // плашка зникла без перезавантаження сторінки.
  importRecent: () => ["finyk", "import-recent"] as const,
};

// ─── Silpo (MCP receipts integration, walking-skeleton experiment) ────────
//
// `SILPO_ENABLED` defaults to `false` server-side — `syncState`/`receipts`
// then 503 with `{code: "SILPO_DISABLED"}`. Hooks surface that as a
// synthetic client-side "disabled" state (never invalidated via these
// keys — it's derived from the error, not cached data).
export const silpoKeys = {
  all: ["silpo"] as const,
  syncState: ["silpo", "sync-state"] as const,
  /** Cursor-paginated `GET /api/silpo/receipts` list, keyed by params so
   *  distinct pages/limits don't collide in cache. */
  receipts: (params?: {
    limit?: number;
    cursor?: string;
    transactionId?: string;
  }) =>
    [
      "silpo",
      "receipts",
      params?.limit ?? null,
      params?.cursor ?? null,
      params?.transactionId ?? null,
    ] as const,
  receiptDetail: (receiptId: string) =>
    ["silpo", "receipts", "detail", receiptId] as const,

  // ── Cart (Track G — «У кошик Сільпо» зі списку покупок) ────────────────
  /**
   * `GET /api/silpo/cart` — поточний стан зовнішнього кошика Сільпо.
   * Інвалідується після успішного `cartApply()`, щоб наступне читання (якщо
   * колись зʼявиться вʼювер поточного кошика) не показувало стейл дані.
   */
  cart: () => ["silpo", "cart"] as const,
  /**
   * `POST /api/silpo/cart/preview` — ключ за ВМІСТОМ запиту (масив
   * `{name, quantity?}`): preview — чиста функція від набору позицій, тож інший набір позицій
   * мусить бути іншим кеш-рядком, а той самий набір (повторне відкриття
   * шіта з тим самим unchecked-списком) — тим самим. React Query серіалізує
   * ключі детерміновано (`hashKey` сортує поля), тож масив обʼєктів як
   * останній елемент — безпечний.
   */
  cartPreview: (items: { name: string; quantity?: number | undefined }[]) =>
    ["silpo", "cart", "preview", items] as const,
};

// ─── Push notifications ───────────────────────────────────────────────────
export const pushKeys = {
  all: ["push"] as const,
  status: ["push", "status"] as const,
  vapid: ["push", "vapid"] as const,
};

// ─── Chat (Free-tier daily usage counter — PR-42) ──────────────────────────
export const chatKeys = {
  all: ["chat"] as const,
  usage: ["chat", "usage"] as const,
};

// ─── Hub (dashboard previews, shared state) ───────────────────────────────
export const hubKeys = {
  all: ["hub"] as const,
  preview: (module: ModuleAccent) => ["hub", "preview", module] as const,
  /**
   * `GET /api/me/profile` write-through row (profile/biometrics; migration
   * 115, NOT an oplog table). One-shot boot fetch consumed by
   * `useProfileWriteThroughBoot` (`core/profile/profileWriteThrough.ts`) to
   * reconcile the local `hub_biometrics_v1` cache against the server on
   * first authenticated boot — see that module for the LWW contract.
   *
   * User-scoped (CodeRabbit PR #627): a static key let a second tab that
   * switched sessions read user A's cached RQ profile response under user
   * B — `userId` in the key makes a session switch a cache MISS instead of
   * a stale hit.
   */
  profile: (userId: string) => ["hub", "profile", userId] as const,
};

// ─── Strategic mode (PR-34 — per-persona weekly goals) ────────────────────
export const strategicKeys = {
  all: ["strategic"] as const,
  goalsForWeek: (weekStart: string) =>
    ["strategic", "goals", "week", weekStart] as const,
};

// ─── Sync (CloudSync v2 outbox status) ────────────────────────────────────
//
// Live counts (`pending` / `rejected` / `dead_letter`) from
// `getSyncEngineWriter().getStatus()` — used by `useSyncStatus` (`OfflineBanner`)
// for an "online + queued" / "blocked" pill. Polled every 30 s while the
// session is online and on `window` focus, invalidated on `online`/`offline`
// transitions (Hard Rule #2 — see `apps/web/src/core/cloudSync/hook/useSyncStatus.ts`).
export const syncKeys = {
  all: ["sync"] as const,
  status: () => ["sync", "status"] as const,
  /** Список термінально відхилених sync-опів (`SyncRejectedList`). */
  rejected: () => ["sync", "rejected"] as const,
};

// ─── Billing (Stripe checkout / subscription status) ──────────────────────
//
// Backed by `/api/billing/status` (`packages/api-client` → `billingApi.status`).
// `usePlan` reads `billingKeys.status` and gates Pro-only UI; invalidation
// is fanned out by `subscriptions.changed` realtime events (NOTIFY listener,
// follow-up PR). For now invalidate manually after `createCheckout` returns
// to `/pricing?checkout=success`.
export const billingKeys = {
  all: ["billing"] as const,
  status: ["billing", "status"] as const,
  // Phase 7 UA billing: список payment-провайдерів, доступних юзеру
  // (`/api/billing/providers`) — джерело для кнопок на /pricing.
  providers: ["billing", "providers"] as const,
};

// ─── AI memory ────────────────────────────────────────────────────────────
//
// Екран «Що ШІ про мене памʼятає» (налаштування → Згода та дані).
// `list` — infinite-query по `GET /api/ai-memory/list`; сторінки
// склеюються keyset-курсором, тож у ключ параметри пагінації НЕ входять:
// інакше кожна сторінка мала б власний кеш-рядок і `invalidateQueries`
// після видалення факту скидав би лише одну з них.
export const aiMemoryKeys = {
  all: ["ai-memory"] as const,
  list: ["ai-memory", "list"] as const,
};

// ─── Token hashing helper ─────────────────────────────────────────────────
//
// Не використовуємо криптографічну стійкість — потрібне лише стабільне,
// детерміноване, коротке представлення токена, щоб (а) різні токени давали
// різні кеш-лінії, (б) токен не витікав у ключ запиту (і відповідно у
// devtools/лог).

export function hashToken(token: string | null | undefined): string {
  if (!token) return "anon";
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x100000001b3) >>> 0;
  }
  return (
    h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
  ).slice(0, 12);
}
