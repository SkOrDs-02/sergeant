/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Аркуш «Фільтри» в «Операціях» (Ф-2 (б), рішення власника OD-26,
 * 2026-11-18; спека `docs/work/specs/finyk-operations-filters.md`). Вантажиться
 * лінивим чанком лише після тапу «Фільтри» (`TransactionsFiltersControl`).
 *
 * Аркуш редагує чернетку і нічого не застосовує, доки не натиснуто
 * «Показати N»: число рахується з того самого списку, що звужують фільтри,
 * тож людина бачить результат до того, як закрила аркуш. Пресетів суми тут
 * немає навмисно: їхніх чисел власник ще не назвав (спека, § Ризики).
 */
import { useId, useMemo, useState } from "react";
import type { TxTagsMap } from "@sergeant/finyk-domain/domain/tags";
import type { Transaction } from "@sergeant/finyk-domain/domain/types";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { Input } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { formatMinorAsInput } from "@shared/lib/format/amount";
import { finykTxFiltersMessages as copy } from "@shared/i18n/uk.finykTxFilters";
import { accountLabel, type LabelledAccount } from "../../lib/accountLabel";
import { formatFoundOperations } from "./TransactionsSearchField";
import {
  EMPTY_TX_ADVANCED_FILTERS,
  filterTransactionsByAdvanced,
  listAccountKeys,
  listTagOptions,
  parseAmountBound,
  type TxAdvancedFilters,
} from "./transactionAdvancedFilters";

const ALL = "__all";

export interface TransactionsFiltersSheetProps {
  value: TxAdvancedFilters;
  /** Список до фільтрів аркуша (місяць, вкладка, пошук): з нього «Показати N». */
  baseList: Transaction[];
  /** Усі операції місяця: з них варіанти рахунку й тегу. */
  monthTx: readonly Transaction[];
  tags: TxTagsMap | undefined;
  accounts: readonly LabelledAccount[];
  onApply: (next: TxAdvancedFilters) => void;
  onClose: () => void;
}

export function TransactionsFiltersSheet({
  value,
  baseList,
  monthTx,
  tags,
  accounts,
  onApply,
  onClose,
}: TransactionsFiltersSheetProps) {
  const fromId = useId();
  const toId = useId();
  const accountHeadingId = useId();
  const tagHeadingId = useId();
  const [fromRaw, setFromRaw] = useState(
    value.minKop === null ? "" : formatMinorAsInput(value.minKop),
  );
  const [toRaw, setToRaw] = useState(
    value.maxKop === null ? "" : formatMinorAsInput(value.maxKop),
  );
  const [accountKey, setAccountKey] = useState(value.accountKey);
  const [tagKey, setTagKey] = useState(value.tagKey);

  const from = parseAmountBound(fromRaw);
  const to = parseAmountBound(toRaw);
  const orderError =
    from.ok &&
    to.ok &&
    from.minor !== null &&
    to.minor !== null &&
    from.minor > to.minor;
  const valid = from.ok && to.ok && !orderError;

  const draft: TxAdvancedFilters = {
    minKop: from.ok ? from.minor : null,
    maxKop: to.ok ? to.minor : null,
    accountKey,
    tagKey,
  };
  const previewCount = filterTransactionsByAdvanced(
    baseList,
    draft,
    tags,
  ).length;

  const accountKeys = useMemo(
    () => listAccountKeys(monthTx, value.accountKey),
    [monthTx, value.accountKey],
  );
  const tagOptions = useMemo(
    () =>
      listTagOptions(
        monthTx,
        tags,
        value.tagKey === null
          ? null
          : { key: value.tagKey, label: value.tagKey },
      ),
    [monthTx, tags, value.tagKey],
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.sheetTitle}
      bodyClassName="space-y-5"
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setFromRaw("");
              setToRaw("");
              setAccountKey(null);
              setTagKey(null);
            }}
          >
            {copy.reset}
          </Button>
          <Button
            variant="solid"
            className="flex-1"
            disabled={!valid}
            onClick={() => onApply(valid ? draft : EMPTY_TX_ADVANCED_FILTERS)}
          >
            {copy.apply.replace("{count}", formatFoundOperations(previewCount))}
          </Button>
        </div>
      }
    >
      <fieldset className="space-y-2">
        <legend className="text-style-label text-text mb-2">
          {copy.amountLegend}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <Input
            id={fromId}
            label={copy.amountFrom}
            inputMode="decimal"
            autoComplete="off"
            value={fromRaw}
            error={!from.ok || orderError}
            onChange={(event) => setFromRaw(event.target.value)}
          />
          <Input
            id={toId}
            label={copy.amountTo}
            inputMode="decimal"
            autoComplete="off"
            value={toRaw}
            error={!to.ok || orderError}
            onChange={(event) => setToRaw(event.target.value)}
          />
        </div>
        {(!from.ok || !to.ok || orderError) && (
          <p className="text-style-caption text-danger" role="alert">
            {orderError ? copy.amountOrder : copy.amountInvalid}
          </p>
        )}
      </fieldset>

      {/* Один рахунок нічого не розрізає: секція мовчить, як «За рахунками»
          в Аналітиці. Обраний рахунок лишається видимим, щоб його зняти. */}
      {accountKeys.length > 1 || value.accountKey !== null ? (
        <section className="space-y-2">
          <h3 id={accountHeadingId} className="text-style-label text-text">
            {copy.accountLegend}
          </h3>
          <ChoiceGroup
            variant="rows"
            ariaLabelledBy={accountHeadingId}
            items={[
              { value: ALL, label: copy.accountAll },
              ...accountKeys.map((key) => ({
                value: key,
                label: accountLabel(key, accounts),
              })),
            ]}
            value={accountKey ?? ALL}
            onChange={(v) => setAccountKey(v === ALL ? null : v)}
          />
        </section>
      ) : null}

      {tagOptions.length > 0 ? (
        <section className="space-y-2">
          <h3 id={tagHeadingId} className="text-style-label text-text">
            {copy.tagLegend}
          </h3>
          <ChoiceGroup
            variant="rows"
            ariaLabelledBy={tagHeadingId}
            items={[
              { value: ALL, label: copy.tagAll },
              ...tagOptions.map((o) => ({ value: o.key, label: o.label })),
            ]}
            value={tagKey ?? ALL}
            onChange={(v) => setTagKey(v === ALL ? null : v)}
          />
        </section>
      ) : null}
    </Sheet>
  );
}
