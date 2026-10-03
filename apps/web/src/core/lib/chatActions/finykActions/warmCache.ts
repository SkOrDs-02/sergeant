/**
 * Канонічний стан Фініка для chat-екшенів (data-08).
 *
 * AI-DANGER: фінансові екзекутори колись читали `ls("finyk_budgets" |
 * "finyk_monthly_plan" | "finyk_debts" | …)`, але UI ці kv-ключі більше не
 * пише (слоти на `useReadonlyPersist`, канон у SQLite, LS→SQLite дренаж
 * прибрано 2026-08). Результат: `set_monthly_plan{expense}` будував план від
 * порожнього kv і затирав решту полів на всіх пристроях, `mark_debt_paid`
 * не знаходив борг із UI, `set_budget_limit` дублював ліміт, а undo писав
 * порожній знімок поверх даних. Тому ВСІ читання стану для запису йдуть
 * звідси, з кешу SQLite, і лише коли він прогрітий.
 *
 * Холодний кеш (`refreshedAt === null`) = ми не знаємо, що в базі. Писати
 * поверх невідомого не можна (diff проти порожнього кешу зробив би upsert
 * «з нуля»), тому екзекутор чесно відповідає
 * {@link FINYK_COLD_CACHE_MESSAGE} і нічого не пише.
 */
import {
  getCachedFinykSqliteState,
  type SqliteFinykCache,
} from "../../../../modules/finyk/lib/sqliteReader";

export const FINYK_COLD_CACHE_MESSAGE =
  "Дані Фініка ще завантажуються, спробуй за кілька секунд.";

/** Прогрітий кеш SQLite або `null`, якщо Фінік ще не завантажено. */
export function warmFinykCache(): SqliteFinykCache | null {
  const cache = getCachedFinykSqliteState();
  return cache.refreshedAt === null ? null : cache;
}
