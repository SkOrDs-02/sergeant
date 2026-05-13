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
 *  - Усі keys-об'єкти експортуємо `as const`, щоб TypeScript виводив
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

  // Proactive AI advice — month-bucketed per budget category
  proactiveAdvice: (monthKey: string, categoryId: string) =>
    ["finyk", "proactive-advice", monthKey, categoryId] as const,

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
  monoWebhookTransactions: (params?: string) =>
    ["finyk", "mono", "webhook-tx", params ?? "all"] as const,

  // Privatbank read endpoints
  privat: ["finyk", "privat"] as const,
  privatAccounts: (idHash: string) =>
    ["finyk", "privat", "accounts", idHash] as const,
  privatStatement: (idHash: string, accId: string, from: string, to: string) =>
    ["finyk", "privat", "statement", idHash, accId, from, to] as const,
};

// ─── Push notifications ───────────────────────────────────────────────────
export const pushKeys = {
  all: ["push"] as const,
  status: ["push", "status"] as const,
  vapid: ["push", "vapid"] as const,
};

// ─── Hub (dashboard previews, shared state) ───────────────────────────────
export const hubKeys = {
  all: ["hub"] as const,
  preview: (module: ModuleAccent) => ["hub", "preview", module] as const,
};

// ─── Strategic mode (PR-34 — per-persona weekly goals) ────────────────────
export const strategicKeys = {
  all: ["strategic"] as const,
  goalsForWeek: (weekStart: string) =>
    ["strategic", "goals", "week", weekStart] as const,
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
