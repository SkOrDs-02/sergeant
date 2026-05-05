import { ls, lsSet } from "../../hubChatUtils";
import type {
  AddAssetAction,
  RecurringExpenseAction,
  ChatActionResult,
} from "../types";

export function addAsset(action: AddAssetAction): ChatActionResult {
  const { name, amount, currency } = action.input;
  const trimmed = (name || "").trim();
  const amt = Number(amount);
  if (!trimmed) return "Потрібна назва активу.";
  if (!Number.isFinite(amt) || amt <= 0)
    return "Сума активу має бути додатною.";
  const cur =
    (currency && String(currency).trim().slice(0, 3).toUpperCase()) || "UAH";
  type AssetEntry = {
    name: string;
    amount: number | string;
    currency?: string;
  };
  const prevAssets = ls<AssetEntry[]>("finyk_assets", []);
  const newEntry: AssetEntry = {
    name: trimmed,
    amount: amt,
    currency: cur,
  };
  lsSet("finyk_assets", [...prevAssets, newEntry]);
  // У `finyk_assets` немає id-поля; тримаємо посилання на щойно
  // додану entry (referential equality в pure-JS після lsSet не
  // тримається, тож порівнюємо за повним shape). Undo прибирає
  // _одну_ перший попавшийся matching item з кінця — досить для
  // human-rate-у undo (5 c вікно), без переписання снапшоту.
  return {
    result: `Актив "${trimmed}" додано: ${amt} ${cur}`,
    undo: () => {
      const list = ls<AssetEntry[]>("finyk_assets", []);
      for (let i = list.length - 1; i >= 0; i--) {
        const e = list[i];
        if (
          e!.name! === newEntry.name &&
          Number(e!.amount!) === Number(newEntry.amount) &&
          (e!.currency! || "UAH") === (newEntry.currency || "UAH")
        ) {
          const next = list.slice();
          next.splice(i, 1);
          lsSet("finyk_assets", next);
          return;
        }
      }
    },
  };
}

export function recurringExpense(
  action: RecurringExpenseAction,
): ChatActionResult {
  const { name, amount, day_of_month, category } = action.input;
  const trimmed = (name || "").trim();
  if (!trimmed) return "Потрібна назва платежу.";
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return "Сума має бути додатною.";
  const day = Number(day_of_month);
  const dayN = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
  const subs = ls<
    Array<{
      id: string;
      name: string;
      amount?: number;
      dayOfMonth?: number;
      category?: string;
    }>
  >("finyk_subs", []);
  const newSub = {
    id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    amount: amt,
    dayOfMonth: dayN,
    category: category?.trim() || "",
  };
  subs.push(newSub);
  lsSet("finyk_subs", subs);
  return `Підписку "${trimmed}" створено: ${amt} грн, ${dayN}-го числа (id:${newSub.id})`;
}
