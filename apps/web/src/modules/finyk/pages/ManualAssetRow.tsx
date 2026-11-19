/**
 * Рядок власного активу в «Активах». Для старого гривневого активу — як
 * раніше (сума вручну, редагування й видалення); для депозиту, ОВДП, фонду
 * і негривневого — вартість на сьогодні й деталі `SavingsAssetDetails`
 * (спека `docs/work/specs/finyk-savings-assets.md`). Параметри типу після
 * створення не редагуються: рух грошей і оцінки йдуть журналом.
 */
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import {
  assetKindOf,
  assetValueMinor,
  getManualAssetCurrencySymbol,
} from "@sergeant/finyk-domain/domain/assets";
import { toDomainAsset } from "../lib/manualAssetAdapter";
import { messages } from "@shared/i18n";
import { FinanceItemHeading } from "../components/FinanceItemHeading";
import type { ManualAsset } from "../hooks/useStorage";
import { SavingsAssetDetails } from "./SavingsAssetDetails";

const kinds = messages.finyk.savingsAssets.kinds;

export function ManualAssetRow({
  asset,
  today,
  showBalance,
  onEdit,
  onDelete,
  onChange,
}: {
  asset: ManualAsset;
  today: string;
  showBalance: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onChange: (next: ManualAsset) => void;
}) {
  const a = toDomainAsset(asset);
  const kind = assetKindOf(a);
  const currency = String(a.currency ?? "UAH");
  const typed = kind !== "other";
  const valueMajor = typed ? assetValueMinor(a, today) / 100 : Number(a.amount);
  const meta = typed ? `${kinds[kind]} · ${currency}` : currency;
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0">
      <FinanceItemHeading
        title={a.name}
        meta={meta}
        value={
          showBalance ? (
            <Money
              amount={valueMajor}
              symbol={getManualAssetCurrencySymbol(currency)}
              tone="inherit"
            />
          ) : (
            "••••"
          )
        }
        actions={
          <>
            {!typed && (
              <button
                type="button"
                onClick={onEdit}
                className="touch-target focus-ring text-subtle hover:text-text transition-colors"
                aria-label={`Редагувати актив ${a.name}`}
              >
                <Icon name="edit" size="md" aria-hidden />
              </button>
            )}
            <button
              type="button"
              onClick={onDelete}
              className="touch-target focus-ring text-subtle hover:text-danger transition-colors"
              aria-label={`Видалити актив ${a.name}`}
            >
              <Icon name="trash" size="md" aria-hidden />
            </button>
          </>
        }
      />
      {(typed || currency !== "UAH") && (
        <SavingsAssetDetails
          asset={asset}
          today={today}
          showBalance={showBalance}
          onChange={onChange}
        />
      )}
    </div>
  );
}
