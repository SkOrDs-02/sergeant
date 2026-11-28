/**
 * Форма рахунку-активу поза Моно: депозит, ОВДП, фонд (спека
 * `docs/work/specs/finyk-savings-assets.md`). Тип обирає `AssetForm`; тут —
 * поля типу, валюта з ручним курсом і перший внесок. Перевірку й побудову
 * активу робить `lib/savingsAssetDraft.ts`.
 */
import { useState } from "react";
import { messages } from "@shared/i18n";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import type { DepositCapitalization } from "@sergeant/finyk-domain/domain/assets";
import type { ManualAsset } from "../hooks/useStorage";
import { fromDomainAsset } from "../lib/manualAssetAdapter";
import {
  buildSavingsAsset,
  emptySavingsDraft,
  isSavingsDraftValid,
  type SavingsAssetDraft,
  type SavingsCurrency,
  type SavingsKind,
} from "../lib/savingsAssetDraft";

const t = messages.finyk.savingsAssets;

const CURRENCIES: readonly SavingsCurrency[] = ["UAH", "USD", "EUR"];

export function SavingsAssetForm({
  kind,
  today,
  initial,
  onAdd,
  onCancel,
}: {
  kind: SavingsKind;
  today: string;
  /** Підставлене з банківської операції (спека finyk-investment-suggestions). */
  initial?: Partial<SavingsAssetDraft> | undefined;
  onAdd: (asset: ManualAsset) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SavingsAssetDraft>(() => ({
    ...emptySavingsDraft(kind, today),
    ...initial,
    kind,
  }));
  // Тип перемикають згори: зберігаємо введене, міняємо лише дефолт податку.
  if (draft.kind !== kind) {
    setDraft(() => ({
      ...emptySavingsDraft(kind, today),
      name: draft.name,
      currency: draft.currency,
      fxRate: draft.fxRate,
      invested: draft.invested,
      date: draft.date,
    }));
  }
  const set = <K extends keyof SavingsAssetDraft>(
    key: K,
    value: SavingsAssetDraft[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const valid = isSavingsDraftValid(draft);
  const field = (
    key: keyof SavingsAssetDraft,
    label: string,
    extra: { helperText?: string; inputMode?: "decimal" | "numeric" } = {},
  ) => (
    <Input
      id={`savings-asset-${key}`}
      label={label}
      inputMode={extra.inputMode ?? "decimal"}
      helperText={extra.helperText}
      value={String(draft[key] ?? "")}
      onChange={(e) => set(key, e.target.value as never)}
    />
  );

  return (
    <div className="space-y-3">
      <Input
        aria-label={t.nameAria}
        placeholder={t.namePlaceholder}
        maxLength={NAME_MAX_LEN}
        showCharCount={false}
        value={draft.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <ChoiceGroup<SavingsCurrency>
        items={CURRENCIES.map((c) => ({ value: c, label: c }))}
        value={draft.currency}
        onChange={(c) => set("currency", c)}
        ariaLabel={t.currency}
        size="sm"
        className="grid grid-cols-3"
      />
      {draft.currency !== "UAH" &&
        field("fxRate", t.fxRate.replace("{currency}", draft.currency), {
          helperText: t.fxRateHint,
        })}
      <MoneyInput
        id="savings-asset-invested"
        label={kind === "ovdp" ? t.investedOvdp : t.invested}
        aria-label={kind === "ovdp" ? t.investedOvdp : t.invested}
        value={draft.invested}
        onValueChange={(next) =>
          set("invested", next == null ? "" : String(next))
        }
      />
      <DateField
        aria-label={kind === "deposit" ? t.startDate : t.date}
        label={kind === "deposit" ? t.startDate : t.date}
        className="w-full"
        value={draft.date}
        onChange={(e) => set("date", e.target.value)}
      />

      {kind === "deposit" && (
        <>
          {field("ratePct", t.rate)}
          <DateField
            aria-label={t.endDate}
            label={t.endDate}
            emptyLabel={t.endDateEmpty}
            className="w-full"
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
          <ChoiceGroup<DepositCapitalization>
            items={(["monthly", "end", "payout"] as const).map((v) => ({
              value: v,
              label: t.capitalizationOptions[v],
            }))}
            value={draft.capitalization}
            onChange={(v) => set("capitalization", v)}
            ariaLabel={t.capitalization}
            variant="rows"
            size="sm"
          />
          {field("taxPct", t.taxPct)}
        </>
      )}

      {kind === "ovdp" && (
        <>
          {field("count", t.count, { inputMode: "numeric" })}
          {field("nominal", t.nominal)}
          {field("couponRatePct", t.couponRate)}
          {field("couponsPerYear", t.couponsPerYear, { inputMode: "numeric" })}
          <DateField
            aria-label={t.maturityDate}
            label={t.maturityDate}
            className="w-full"
            value={draft.maturityDate}
            onChange={(e) => set("maturityDate", e.target.value)}
          />
          {field("taxPct", t.taxPct)}
        </>
      )}

      {kind === "fund" && (
        <MoneyInput
          id="savings-asset-current-value"
          label={t.currentValue}
          aria-label={t.currentValue}
          helperText={t.currentValueHint}
          value={draft.currentValue}
          onValueChange={(next) =>
            set("currentValue", next == null ? "" : String(next))
          }
        />
      )}

      {!valid && (
        <p className="text-style-caption text-subtle" role="status">
          {t.fillRequired}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          className="flex-1"
          size="sm"
          tone="ink"
          variant="solid"
          disabled={!valid}
          onClick={() => {
            const asset = buildSavingsAsset(draft, {
              today,
              newId: () => crypto.randomUUID(),
            });
            if (asset) onAdd(fromDomainAsset(asset));
          }}
        >
          {t.add}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
        >
          {messages.actions.cancel}
        </Button>
      </div>
    </div>
  );
}
