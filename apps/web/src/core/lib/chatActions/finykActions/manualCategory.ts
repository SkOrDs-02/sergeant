/**
 * Зміна категорії РУЧНОГО запису з чату (`change_category`, `batch_categorize`).
 *
 * AI-CONTEXT (bv-chat-category, перевірка 2026-11-20): ручний запис тримає
 * категорію у власному полі `category`, а список Операцій, аркуш редагування
 * й Аналітика бачать його як `manual_<id>` (`manualExpenseToTransaction`).
 * Чат писав override під СИРИЙ id у `finyk_tx_categories`, якого жоден екран
 * не читає: картка казала «Категорію змінено», а запис лишався «Інше». Тому
 * ручний запис міняємо канонічним шляхом аркуша (`editManualExpense`): поле
 * `category` у `finyk_manual_expenses_v1`. Override-и під обома формами id
 * (сирий від старого чату, `manual_<id>` від масової зміни в списку) знімаємо:
 * `manual_<id>` перебив би нову категорію в списку, а сирий — у пошуку чату.
 * Undo повертає і поле, і зняті override-и.
 */
import {
  manualLinkKey,
  rawManualId,
} from "@sergeant/finyk-domain/domain/debtLinkKeys";
import type { SqliteFinykCache } from "../../../../modules/finyk/lib/sqliteReader";
import { finykChatWrite } from "./dualWriteBridge";
import { warmFinykCache } from "./warmCache";

/**
 * Сирий id ручного запису для `id` (сирого чи `manual_<id>` зі списку
 * Операцій) або `null`, якщо це не ручний запис.
 */
export function resolveManualExpenseId(
  cache: SqliteFinykCache,
  id: string,
): string | null {
  const raw = rawManualId(id);
  for (const candidate of id === raw ? [id] : [id, raw]) {
    if (cache.manualExpenses.some((e) => String(e.id ?? "") === candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Ставить `categoryId` ручним записам `ids` і повертає undo. Запис іде через
 * `finykChatWrite`, тож «змінено» підтверджується лише коли рядок ліг у SQLite
 * (інакше `settle()` замінює результат на `WRITE_NOT_PERSISTED`).
 */
export function applyManualCategory(
  cache: SqliteFinykCache,
  ids: ReadonlyArray<string>,
  categoryId: string,
): () => void {
  const wanted = new Set(ids);
  const prevCategory = new Map<string, string | undefined>();
  const next = cache.manualExpenses.map((e) => {
    const id = String(e.id ?? "");
    if (!wanted.has(id) && !wanted.has(manualLinkKey(id))) return e;
    prevCategory.set(id, e.category);
    return { ...e, category: categoryId };
  });
  void finykChatWrite("finyk_manual_expenses_v1", next);

  const removedOverrides: Record<string, string> = {};
  const cats = { ...cache.txCategories } as Record<string, string>;
  for (const id of prevCategory.keys()) {
    for (const key of [id, manualLinkKey(id)]) {
      const value = cats[key];
      if (value === undefined) continue;
      removedOverrides[key] = value;
      delete cats[key];
    }
  }
  if (Object.keys(removedOverrides).length > 0) {
    void finykChatWrite("finyk_tx_cats", cats);
  }

  return () => {
    const current = warmFinykCache();
    if (!current) return;
    const restored = current.manualExpenses.map((e) => {
      const id = String(e.id ?? "");
      if (!prevCategory.has(id)) return e;
      return { ...e, category: prevCategory.get(id) ?? "" };
    });
    void finykChatWrite("finyk_manual_expenses_v1", restored);
    if (Object.keys(removedOverrides).length > 0) {
      void finykChatWrite("finyk_tx_cats", {
        ...current.txCategories,
        ...removedOverrides,
      });
    }
  };
}
