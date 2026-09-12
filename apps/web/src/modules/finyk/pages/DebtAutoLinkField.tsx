/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Поле «автопривʼязка платежів» у формі пасиву (Level 2, рішення
 * власника 2026-09-11 — канон `docs/product/modules/finyk.md` § Журнал
 * рішень). Той самий контракт, що вже тримає `SubscriptionForm` для
 * підписок (`getLastTxForSubscription`): регістронезалежний підрядок
 * опису, live-превʼю збігів під полем. Різниця — підписка шукає ОДНУ
 * останню транзакцію, тут лічимо ВСІ майбутні збіги, бо саме їх після
 * збереження привʼяже `useDebtAutoLink`.
 *
 * Окремий файл, а не інлайн у `AssetsForm.tsx` — той файл уже впритул
 * до Hard Rule #18 (`max-lines: 600`).
 *
 * `editingDebt` (CodeRabbit finding #3, PR #1103): превʼю рахує збіги
 * для пасиву, який РЕДАГУЄТЬСЯ, тож мусить виключати те саме, що
 * виключає сам матчер під час запису (`useDebtAutoLink.ts`) —
 * `linkedTxIds` і `autoLinkDismissedTxIds`. Без цього лічильник обіцяв
 * більше збігів, ніж авто-привʼязка реально зробить. Для нового пасиву
 * `editingDebt` відсутній — виключати нема чого.
 */
import { Input } from "@shared/components/ui/Input";
import { Label } from "@shared/components/ui/FormField";
import { matchDebtAutoLinkTxIds } from "@sergeant/finyk-domain/domain/debtAutoLink";
import type { Debt } from "@sergeant/finyk-domain/domain/debtEngine";
import type { TxRowTx } from "../components/TxRow";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { finykPageMessages as finykCopy } from "@shared/i18n/uk.finyk";

const copy = finykCopy.debtAutoLink;

export function DebtAutoLinkField({
  keyword,
  onKeywordChange,
  transactions = [],
  editingDebt,
}: {
  keyword: string;
  onKeywordChange: (value: string) => void;
  transactions?: readonly TxRowTx[];
  editingDebt?: Debt | undefined;
}) {
  const trimmed = keyword.trim();
  // `exactOptionalPropertyTypes` — не ставити ключ узагалі, коли значення
  // немає, замість присвоєння `undefined` (пасив-новачок нічого не виключає).
  const matchCount = trimmed
    ? matchDebtAutoLinkTxIds(
        {
          autoLinkKeyword: trimmed,
          ...(editingDebt?.linkedTxIds
            ? { linkedTxIds: editingDebt.linkedTxIds }
            : {}),
          ...(editingDebt?.autoLinkDismissedTxIds
            ? { autoLinkDismissedTxIds: editingDebt.autoLinkDismissedTxIds }
            : {}),
        },
        transactions,
      ).length
    : 0;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="debt-auto-link-keyword" optional>
        {copy.fieldLabel}
      </Label>
      <Input
        id="debt-auto-link-keyword"
        aria-label={copy.fieldLabel}
        {...searchFieldProps("debt-auto-link-keyword-search")}
        placeholder={copy.placeholder}
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
      />
      <p className="text-style-body text-subtle">{copy.hint}</p>
      {trimmed && (
        <p className="text-style-caption text-subtle" role="status">
          {matchCount > 0
            ? `${copy.matchesFoundPrefix} ${matchCount}`
            : copy.noMatches}
        </p>
      )}
    </div>
  );
}
