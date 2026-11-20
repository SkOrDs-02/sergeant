/**
 * Деталі рахунку-активу під рядком у «Активах» (спека
 * `docs/work/specs/finyk-savings-assets.md`): вкладено й результат, курс
 * для негривневого, «строк минув» із закриттям, журнал подій із додаванням
 * і видаленням. Старий гривневий актив без типу сюди не потрапляє.
 */
import { useState } from "react";
import { messages } from "@shared/i18n";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { DateField } from "@shared/components/ui/DateField";
import { Input } from "@shared/components/ui/Input";
import { MoneyInput } from "@shared/components/ui/MoneyInput";
import { Icon } from "@shared/components/ui/Icon";
import { parseAmountToMinor } from "@shared/lib/format/amount";
import { formatNumberUk } from "@sergeant/shared";
import {
  assetKindOf,
  getManualAssetCurrencySymbol,
  isAssetMatured,
  ovdpLots,
  ovdpUpcomingCoupons,
  sortedAssetEvents,
  valueAsset,
  type AssetEvent,
  type AssetEventType,
  type ManualAsset as DomainAsset,
} from "@sergeant/finyk-domain/domain/assets";
import type { ManualAsset } from "../hooks/useStorage";
import { parseDecimal, withCachedAmount } from "../lib/savingsAssetDraft";
import { fromDomainAsset, toDomainAsset } from "../lib/manualAssetAdapter";

const t = messages.finyk.savingsAssets;
const EVENT_TYPES: readonly AssetEventType[] = [
  "contribution",
  "withdrawal",
  "income",
  "valuation",
];

function fmtMoney(minor: number, currency: string): string {
  const sym = getManualAssetCurrencySymbol(currency);
  return `${formatNumberUk(minor / 100, { maximumFractionDigits: 2 })} ${sym}`;
}

function fmtDate(key: string): string {
  const [y, m, d] = key.split("-");
  return y && m && d ? `${d}.${m}.${y}` : key;
}

export function SavingsAssetDetails({
  asset,
  today,
  showBalance,
  onChange,
}: {
  asset: ManualAsset;
  today: string;
  showBalance: boolean;
  onChange: (next: ManualAsset) => void;
}) {
  const a = toDomainAsset(asset);
  const kind = assetKindOf(a);
  const v = valueAsset(a, today);
  const currency = String(a.currency ?? "UAH");
  const [journalOpen, setJournalOpen] = useState(false);
  const [rateDraft, setRateDraft] = useState(
    a.fxRate ? String(a.fxRate.uahPerUnit) : "",
  );
  const commit = (next: DomainAsset) =>
    onChange(fromDomainAsset(withCachedAmount(next, today), asset));
  const hide = (s: string) => (showBalance ? s : "••••");

  const lines: string[] = [];
  if (kind === "deposit" && a.deposit) {
    lines.push(
      (a.deposit.endDate ? t.depositUntil : t.depositMeta)
        .replace("{rate}", formatNumberUk(a.deposit.ratePct))
        .replace("{date}", fmtDate(a.deposit.endDate ?? "")),
    );
  }
  if (kind === "ovdp" && a.ovdp) {
    const count = ovdpLots(a, today).reduce((s, l) => s + l.count, 0);
    lines.push(
      t.ovdpMeta
        .replace("{count}", String(count))
        .replace("{date}", fmtDate(a.ovdp.maturityDate)),
    );
    const next = ovdpUpcomingCoupons(a.ovdp, today)[0];
    if (next) lines.push(t.nextCoupon.replace("{date}", fmtDate(next)));
  }
  if (v.investedMinor !== null) {
    lines.push(
      v.resultMinor !== null && v.resultPct !== null
        ? t.investedLine
            .replace("{invested}", hide(fmtMoney(v.investedMinor, currency)))
            .replace(
              "{result}",
              hide(
                `${v.resultMinor >= 0 ? "+" : "−"}${fmtMoney(Math.abs(v.resultMinor), currency)}`,
              ),
            )
            .replace(
              "{pct}",
              `${v.resultPct >= 0 ? "+" : "−"}${formatNumberUk(Math.abs(v.resultPct), { maximumFractionDigits: 1 })}`,
            )
        : t.investedOnly.replace(
            "{invested}",
            hide(fmtMoney(v.investedMinor, currency)),
          ),
    );
  }
  if (currency !== "UAH") {
    lines.push(
      v.uahMinor !== null && a.fxRate
        ? t.fxLine
            .replace("{uah}", hide(fmtMoney(v.uahMinor, "UAH")))
            .replace("{rate}", formatNumberUk(a.fxRate.uahPerUnit))
            .replace("{date}", fmtDate(a.fxRate.asOf))
        : t.noFxLine,
    );
  }
  const matured = isAssetMatured(a, today);
  const events = sortedAssetEvents(a);

  return (
    <div className="mt-2 space-y-2">
      {lines.map((line) => (
        <p key={line} className="text-style-caption text-muted">
          {line}
        </p>
      ))}
      {currency !== "UAH" && (
        <div className="flex items-end gap-2">
          <Input
            id={`asset-rate-${a.id}`}
            label={t.rateUpdate}
            inputMode="decimal"
            value={rateDraft}
            onChange={(e) => setRateDraft(e.target.value)}
            className="flex-1"
          />
          {/* «Зберегти» — одна форма, суцільна чорнилом (гейт
              `Button.saveRole.test.ts`). */}
          <Button
            size="sm"
            disabled={!((parseDecimal(rateDraft) ?? 0) > 0)}
            onClick={() =>
              commit({
                ...a,
                fxRate: {
                  uahPerUnit: parseDecimal(rateDraft) as number,
                  asOf: today,
                },
              })
            }
          >
            {t.rateSave}
          </Button>
        </div>
      )}
      {matured && (
        <div className="rounded-panel border border-line bg-panel px-3 py-2 space-y-2">
          <p className="text-style-caption text-text" role="status">
            {t.matured}
          </p>
          <Button
            size="sm"
            variant="outline"
            aria-label={t.closeAria.replace("{name}", a.name)}
            onClick={() => commit({ ...a, status: "closed", closedAt: today })}
          >
            {t.close}
          </Button>
        </div>
      )}
      {kind !== "other" && (
        <>
          <Button
            variant="text"
            size="sm"
            aria-expanded={journalOpen}
            aria-label={t.journalToggleAria.replace("{name}", a.name)}
            onClick={() => setJournalOpen((o) => !o)}
          >
            {t.journalToggle.replace("{n}", String(events.length))}
          </Button>
          {journalOpen && (
            <AssetJournal
              asset={a}
              events={events}
              today={today}
              currency={currency}
              onCommit={commit}
            />
          )}
        </>
      )}
    </div>
  );
}

function AssetJournal({
  asset,
  events,
  today,
  currency,
  onCommit,
}: {
  asset: DomainAsset;
  events: AssetEvent[];
  today: string;
  currency: string;
  onCommit: (next: DomainAsset) => void;
}) {
  const [type, setType] = useState<AssetEventType>("contribution");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [count, setCount] = useState("");
  const isOvdpMove =
    asset.kind === "ovdp" && (type === "contribution" || type === "withdrawal");
  const minor = parseAmountToMinor(amount);
  const countOk = !isOvdpMove || !count || Number.isInteger(Number(count));
  const canAdd = minor.ok && !!date && countOk;

  return (
    <div className="space-y-2 rounded-panel border border-line px-3 py-2">
      {events.length === 0 && (
        <p className="text-style-caption text-muted">{t.journalEmpty}</p>
      )}
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-2">
            <span className="flex-1 text-style-caption text-text">
              {fmtDate(e.date)} · {t.eventTypes[e.type]} ·{" "}
              {fmtMoney(e.amountMinor, currency)}
              {e.count ? ` · ${e.count} шт` : ""}
              {e.txId ? ` · ${t.linkedTx}` : ""}
            </span>
            <button
              type="button"
              className="touch-target focus-ring text-subtle hover:text-danger transition-colors"
              aria-label={t.deleteEventAria
                .replace("{type}", t.eventTypes[e.type])
                .replace("{date}", fmtDate(e.date))}
              onClick={() =>
                onCommit({
                  ...asset,
                  events: (asset.events ?? []).filter((x) => x.id !== e.id),
                })
              }
            >
              <Icon name="trash" size="md" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <ChoiceGroup<AssetEventType>
        items={EVENT_TYPES.map((k) => ({ value: k, label: t.eventTypes[k] }))}
        value={type}
        onChange={setType}
        ariaLabel={t.eventTypeLabel}
        size="sm"
        className="grid grid-cols-2"
      />
      <MoneyInput
        aria-label={t.eventAmount}
        placeholder={t.eventAmount}
        value={amount}
        onValueChange={(next) => setAmount(next == null ? "" : String(next))}
      />
      <DateField
        aria-label={t.eventDate}
        className="w-full"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {isOvdpMove && (
        <Input
          id={`asset-event-count-${asset.id}`}
          label={t.eventCount}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
        />
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={!canAdd}
        onClick={() => {
          if (!minor.ok) return;
          const event: AssetEvent = {
            id: crypto.randomUUID(),
            type,
            date,
            amountMinor: minor.minor,
            ...(isOvdpMove && Number(count) > 0
              ? { count: Number(count) }
              : {}),
          };
          onCommit({ ...asset, events: [...(asset.events ?? []), event] });
          setAmount("");
          setCount("");
        }}
      >
        {t.addEvent}
      </Button>
    </div>
  );
}
