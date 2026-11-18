/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Що видно з історії банку» — до трьох фактів, порахованих кодом із
 * історії Monobank, у перший тиждень (С-4 (б), спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`). Одноразова: «Зрозуміло»
 * або «✕» ховають її назавжди для профілю браузера, як `CrossModulePreview`.
 * Слоту в бюджеті банерів не бере: це дані, а не підказка.
 */
import { useCallback, useMemo, useState } from "react";
import { formatNumberUk, NARROW_NBSP, STORAGE_KEYS } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { coreMessages } from "@shared/i18n/uk.core";
import { webKVStore } from "@shared/lib/storage/storage";
import { formatKyivLongDate } from "@shared/lib/time/kyivTime";
import {
  isFinykBalanceHidden,
  maskAmount,
} from "../../modules/finyk/lib/balanceVisibility";
import {
  useFinykMirrorTransactions,
  useFinykStatTransactions,
} from "../../modules/finyk/hooks/useFinykStatTransactions";
import {
  buildBankHistoryFacts,
  type BankHistoryFacts,
} from "../insights/bankHistoryFacts";

const copy = coreMessages.hub.bankFacts;

const fill = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

function money(units: number, hidden: boolean, symbol = "₴"): string {
  return maskAmount(
    `${formatNumberUk(Math.round(units))}${NARROW_NBSP}${symbol}`,
    hidden,
  );
}

// 2024-01-01 — понеділок; назва дня тижня з Intl, а не з каталогу копії
// (каталог приймає лише рядки).
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("uk-UA", {
  weekday: "long",
  timeZone: "UTC",
});
function weekdayName(mondayIndex: number): string {
  return WEEKDAY_FORMAT.format(new Date(Date.UTC(2024, 0, 1 + mondayIndex)));
}

/** Рядки картки; порожній масив — фактів немає, картки теж. */
export function formatBankHistoryFacts(
  facts: BankHistoryFacts,
  hidden: boolean,
): string[] {
  const lines: string[] = [];
  if (facts.topCategory) {
    lines.push(
      fill(copy.topCategory, {
        category: facts.topCategory.label,
        amount: money(facts.topCategory.spent, hidden),
        pct: `${facts.topCategory.pct}${NARROW_NBSP}%`,
      }),
    );
  }
  if (facts.recurring) {
    lines.push(
      fill(copy.recurring, {
        count: facts.recurring.count,
        name: facts.recurring.biggestName,
        amount: money(
          facts.recurring.biggestAmount,
          hidden,
          facts.recurring.currency === "USD" ? "$" : "₴",
        ),
      }),
    );
  }
  const third = facts.third;
  if (third?.kind === "weekday") {
    lines.push(
      fill(copy.weekday, {
        weekday: weekdayName(third.mondayIndex),
        amount: money(third.avgMinor / 100, hidden),
      }),
    );
  } else if (third?.kind === "largest") {
    const vars = {
      amount: money(third.amountMinor / 100, hidden),
      description: third.description,
      date: formatKyivLongDate(new Date(third.time * 1000).toISOString()) ?? "",
    };
    lines.push(
      fill(third.description ? copy.largest : copy.largestNoDescription, vars),
    );
  }
  return lines;
}

export function hasSeenBankHistoryFacts(): boolean {
  return webKVStore.getString(STORAGE_KEYS.HUB_BANK_FACTS_SEEN) === "1";
}

function markBankHistoryFactsSeen(): void {
  webKVStore.setString(STORAGE_KEYS.HUB_BANK_FACTS_SEEN, "1");
}

/**
 * Рядки фактів, коли картку можна показати. `enabled` складає хаб:
 * людина увійшла, Фінік активний, триває перший тиждень.
 */
export function useBankHistoryFactLines(enabled: boolean): string[] {
  const mirror = useFinykMirrorTransactions();
  const { statTransactions, slots } = useFinykStatTransactions();
  const { txCategories, txSplits, customCategories } = slots;
  const hidden = isFinykBalanceHidden();
  return useMemo(() => {
    // Без дзеркала банку Monobank не підключено: «історії банку» немає,
    // навіть якщо є ручні записи.
    if (!enabled || mirror.length === 0) return [];
    const facts = buildBankHistoryFacts(statTransactions, {
      txCategories,
      txSplits,
      customCategories,
    });
    return formatBankHistoryFacts(facts, hidden);
  }, [
    enabled,
    mirror.length,
    statTransactions,
    txCategories,
    txSplits,
    customCategories,
    hidden,
  ]);
}

export function BankHistoryFactsView({
  lines,
  onDismiss,
}: {
  lines: readonly string[];
  onDismiss: () => void;
}) {
  return (
    <Card
      as="section"
      prominence="panel"
      padding="md"
      className="relative"
      aria-labelledby="bank-history-facts-title"
      data-testid="bank-history-facts"
    >
      <div className="absolute top-1 right-1">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={copy.dismiss}
          onClick={onDismiss}
        >
          <Icon name="close" size="md" aria-hidden />
        </Button>
      </div>
      <div className="space-y-2 pr-10">
        <h2
          id="bank-history-facts-title"
          className="text-style-label text-text"
        >
          {copy.title}
        </h2>
        <ul className="space-y-1 text-style-body text-text">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex pt-1">
          <Button variant="outline" size="sm" onClick={onDismiss}>
            {copy.ok}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function BankHistoryFactsCard({ enabled }: { enabled: boolean }) {
  const [seen, setSeen] = useState(hasSeenBankHistoryFacts);
  const lines = useBankHistoryFactLines(enabled && !seen);
  const dismiss = useCallback(() => {
    markBankHistoryFactsSeen();
    setSeen(true);
  }, []);
  if (seen || lines.length === 0) return null;
  return <BankHistoryFactsView lines={lines} onDismiss={dismiss} />;
}
