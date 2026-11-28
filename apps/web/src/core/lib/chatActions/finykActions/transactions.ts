// Chat-action executors run outside React. Стан читається з SQLite warm
// cache (`warmFinykCache`), а не з kv — див. warmCache.ts (data-08).
import { finykChatWrite } from "./dualWriteBridge";
import { validateTransactionInput } from "./transactionInputValidation";
import { FINYK_COLD_CACHE_MESSAGE, warmFinykCache } from "./warmCache";
import {
  finykCategoryExists,
  finykExpenseAmountUah,
  finykTransactionExists,
  finykTransactionLabel,
  normalizeFinykId,
  unknownCategoryMessage,
  unknownTransactionMessage,
} from "./entityLookup";
import { resolveExpenseCategoryMeta } from "../../../../modules/finyk/utils";
import {
  triggerHiddenTransactionSqliteMirror,
  triggerManualExpenseDeleteSqliteMirror,
} from "../../../../modules/finyk/lib/sqliteWriter";
import { emitFinykExpenseRoutineAutoMark } from "../../../../modules/finyk/lib/routineAutoMark";
import { parseKyivDate } from "@shared/lib/time/kyivTime";
import { formatNumberUk } from "@sergeant/shared";
import { manualLinkKey } from "@sergeant/finyk-domain/domain/debtLinkKeys";
import type {
  CreateTransactionAction,
  DeleteTransactionAction,
  HideTransactionAction,
  SplitTransactionAction,
  ChatActionResult,
} from "../types";

type ManualExpenseRow = {
  id: string;
  date: string;
  description?: string;
  amount: number;
  category?: string;
  type?: string;
};

/**
 * Подія «записана витрата» для автовідмітки Рутини (рішення founder-а
 * 2026-11-18): витрата з чату записана самою людиною, як і з форми. Явна дата
 * `YYYY-MM-DD` уже є день-ключем, без неї день бере годинник пристрою
 * (ADR-0078), а не київську північ із `isoDate`. Спільна для серверного шляху
 * і локального фолбеку; дохід, збій запису і відкат її не викликають.
 */
export function emitChatExpenseRoutineAutoMark(
  date: string | undefined,
  recordedAt: Date = new Date(),
): void {
  emitFinykExpenseRoutineAutoMark(
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : recordedAt,
  );
}

export function createTransaction(
  action: CreateTransactionAction,
): ChatActionResult {
  const { type, category, description, date } = action.input;
  // Ті самі межі, що на сервері (сума, довжина опису, діапазон дати): цей шлях
  // — дохід і офлайн-фолбек витрати — не проходить `ManualExpenseCreateSchema`.
  const checked = validateTransactionInput(action.input);
  if (!checked.ok) return checked.message;
  const amt = checked.amount;
  const txType = type === "income" ? "income" : "expense";
  // Мить запису фіксуємо тут, а не в `.then` після SQLite: день події для
  // Рутини має бути днем, коли людина записала витрату, а не днем, коли
  // відпрацював запис (різниця видна біля півночі).
  const recordedAt = new Date();
  const nowIso = recordedAt.toISOString();
  const isoDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? (parseKyivDate(date)?.toISOString() ?? nowIso)
      : nowIso;
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const customC = cache.customCategories;
  let categoryLabel = "";
  if (category && category.trim()) {
    const meta = resolveExpenseCategoryMeta(category.trim(), customC);
    categoryLabel = meta?.label || category.trim();
  }
  const manualId = `m_${crypto.randomUUID()}`;
  const manualExpenses: ManualExpenseRow[] = [...cache.manualExpenses];
  const entry = {
    id: manualId,
    date: isoDate,
    description: description?.trim() || "",
    amount: Math.abs(amt),
    category: category?.trim() || "",
    type: txType,
  };
  manualExpenses.unshift(entry);
  const write = finykChatWrite("finyk_manual_expenses_v1", manualExpenses);
  if (txType === "expense") {
    // Лише коли запис ліг: відмова чи тайм-аут SQLite не відмічає звичку.
    void write.then(
      (ok) => {
        if (ok) emitChatExpenseRoutineAutoMark(date, recordedAt);
      },
      () => undefined,
    );
  }
  const label = categoryLabel ? ` (${categoryLabel})` : "";
  const human = txType === "income" ? "Дохід" : "Витрату";
  const result = `${human} ${formatNumberUk(amt)} грн${description ? ` "${description.trim()}"` : ""}${label} записано (id:${manualId})`;
  // Undo видаляє щойно додану транзакцію за `manualId`. Якщо юзер
  // паралельно встиг видалити її іншим шляхом — ідемпотентно
  // нічого не робимо (а не throw): двічі натиснений undo не має
  // дати "не вдалось повернути".
  return {
    result,
    undo: () => {
      const current = warmFinykCache()?.manualExpenses ?? [];
      const next = current.filter((tx) => tx.id !== manualId);
      if (next.length !== current.length) {
        void finykChatWrite("finyk_manual_expenses_v1", next);
      }
      // Keep SQLite in step with the LS undo so the row stops showing up
      // in the overlay read. Soft-delete is idempotent — safe to fire
      // even if the LS entry was already removed elsewhere.
      triggerManualExpenseDeleteSqliteMirror(manualId);
    },
  };
}

/** ` «Кава» на 120 грн` для речення «Операцію… видалено»; порожньо без підпису. */
function labelPart(id: string): string {
  const label = finykTransactionLabel(id);
  return label ? ` ${label}` : "";
}

export function hideTransaction(
  action: HideTransactionAction,
): ChatActionResult {
  const txId = normalizeFinykId(action.input.tx_id);
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  if (!finykTransactionExists(txId)) return unknownTransactionMessage(txId);
  // Ручний запис ховаємо під `manual_<id>`: так його шукають Огляд, Операції
  // і канонічний excluded-set; сирий id там ніхто не звіряє.
  const isManual = cache.manualExpenses.some(
    (tx) => String(tx.id ?? "") === txId,
  );
  const key = isManual ? manualLinkKey(txId) : txId;
  const hidden = [...cache.hiddenTransactions];
  if (!hidden.includes(key)) {
    hidden.push(key);
    void finykChatWrite("finyk_hidden_txs", hidden);
  }
  // Mirror into `finyk_hidden_transactions` — the hidden-tx read
  // (search / analytics / report) overlays from SQLite. Idempotent.
  triggerHiddenTransactionSqliteMirror(key);
  return `Операцію${labelPart(txId)} приховано зі статистики (id:${txId})`;
}

export function deleteTransaction(
  action: DeleteTransactionAction,
): ChatActionResult {
  const id = normalizeFinykId(action.input.tx_id);
  if (!id) return "Потрібен tx_id для видалення.";
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  const list = cache.manualExpenses;
  const idx = list.findIndex((t) => String(t.id ?? "") === id);
  if (idx < 0) {
    // «Ручний» визначає сховище, а не префікс id. Перевірка `m_` пускала
    // лише записи офлайн-шляху чату: ручні записи з форми (`mx_…`) і з
    // сервера (голий UUID) відхилялись як «не ручні», тож Сержант не міг
    // видалити витрату, яку сам щойно записав (прогін full-2026-11-25).
    if (finykTransactionExists(id)) {
      return `Операцію${labelPart(id)} не видалено (id:${id}): це операція з банку, її можна лише приховати. (для моделі: запропонуй hide_transaction)`;
    }
    return unknownTransactionMessage(id);
  }
  // Підпис рахуємо до запису: після нього операції в кеші вже немає.
  const label = labelPart(id);
  const next = list.slice();
  next.splice(idx, 1);
  void finykChatWrite("finyk_manual_expenses_v1", next);
  triggerManualExpenseDeleteSqliteMirror(id);
  return `Операцію${label} видалено (id:${id})`;
}

export function splitTransaction(
  action: SplitTransactionAction,
): ChatActionResult {
  const { tx_id, parts: splitParts } = action.input;
  const id = normalizeFinykId(tx_id);
  if (!id) return "Потрібен tx_id.";
  const cache = warmFinykCache();
  if (!cache) return FINYK_COLD_CACHE_MESSAGE;
  if (!finykTransactionExists(id)) return unknownTransactionMessage(id);
  if (!Array.isArray(splitParts) || splitParts.length < 2)
    return "Потрібно мінімум 2 частини для розділення.";
  const splits: Record<
    string,
    Array<{ categoryId: string; amount: number }>
  > = { ...(cache.txSplits as Record<string, never>) };
  // Сума частин ЗАМІНЮЄ суму операції в статистиці й лімітах
  // (`getTxStatAmount`), тож, як і редактор спліту в UI, приймаємо лише
  // розподіл витрати рівно на її суму.
  const total = finykExpenseAmountUah(id);
  if (total === null)
    return `Операцію${labelPart(id)} не розділено (id:${id}): розділити можна лише витрату.`;
  const customC = cache.customCategories;
  const newSplits = splitParts.map((p) => ({
    categoryId: normalizeFinykId(p.category_id),
    amount: Math.abs(Number(p.amount)),
  }));
  if (newSplits.some((s) => !Number.isFinite(s.amount) || s.amount <= 0))
    return "Кожна частина має бути сумою в гривнях, більшою за 0.";
  const partsSum = newSplits.reduce((sum, s) => sum + s.amount, 0);
  if (Math.round(partsSum * 100) !== Math.round(total * 100))
    return `Операцію${labelPart(id)} не розділено (id:${id}): частини дають ${formatNumberUk(partsSum)} грн, а операція на ${formatNumberUk(total)} грн. Сума частин має дорівнювати сумі операції.`;
  const unknownPart = newSplits.find((s) => !finykCategoryExists(s.categoryId));
  if (unknownPart) return unknownCategoryMessage(unknownPart.categoryId);
  // Спліти для tx_id перезаписуються цілком: знімок попередніх потрібен
  // для undo (`undefined` — спліту не було, тож undo прибирає ключ).
  const prevSplit = (
    cache.txSplits as Record<
      string,
      Array<{ categoryId: string; amount: number }> | undefined
    >
  )[id];
  splits[id] = newSplits;
  void finykChatWrite("finyk_tx_splits", splits);
  const desc = newSplits
    .map((s) => {
      const cat = resolveExpenseCategoryMeta(s.categoryId, customC);
      return `${cat?.label || s.categoryId}: ${formatNumberUk(s.amount)} грн`;
    })
    .join(", ");
  return {
    result: `Операцію${labelPart(id)} розділено на ${newSplits.length} частин: ${desc} (id:${id})`,
    // Читає свіжий кеш і чіпає лише ключ цього tx, щоб не затерти спліти
    // інших операцій, змінені між дією й відкатом.
    undo: () => {
      const cur: Record<string, unknown> = {
        ...((warmFinykCache()?.txSplits as Record<string, unknown>) ?? {}),
      };
      if (prevSplit === undefined) delete cur[id];
      else cur[id] = prevSplit;
      void finykChatWrite("finyk_tx_splits", cur);
    },
  };
}
