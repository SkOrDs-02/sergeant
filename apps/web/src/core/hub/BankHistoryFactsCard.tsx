/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Що видно з історії банку» — до трьох фактів, порахованих кодом із
 * історії Monobank, у перший тиждень після першого підключення банку
 * (С-4 (б), В-2 → (Б) рішення founder-а 2026-11-18; спека
 * `docs/work/specs/hub-newcomer-card-and-insights.md`). Одноразова: «Зрозуміло»
 * або «✕» ховають її назавжди для профілю браузера, як `CrossModulePreview`.
 * Слоту в бюджеті банерів не бере: це дані, а не підказка.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MonoSyncState } from "@shared/api";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { formatNumberUk, NARROW_NBSP, STORAGE_KEYS } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { coreMessages } from "@shared/i18n/uk.core";
import { webKVStore } from "@shared/lib/storage/storage";
import { formatKyivLongDate } from "@shared/lib/time/kyivTime";
import { uaWeekdayName } from "@shared/lib/time/uaWeekdayDate";
import {
  isFinykBalanceHidden,
  maskAmount,
} from "../../modules/finyk/lib/balanceVisibility";
import {
  useFinykMirrorTransactions,
  useFinykStatTransactions,
} from "../../modules/finyk/hooks/useFinykStatTransactions";
import {
  getFinykBankHistoryStart,
  getMonoFirstConnectedAt,
} from "@finyk/lib/bankHistory";
import {
  buildBankHistoryFacts,
  isWithinBankFactsWindow,
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
        weekday: uaWeekdayName(third.mondayIndex),
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
 * Рядки фактів, коли картку можна показати. `enabled` складає хаб (людина
 * увійшла, Фінік активний); вікно першого тижня від підключення Monobank
 * перевіряє хук сам.
 */
/**
 * Момент підключення Monobank для вікна картки. Серверне значення з кешу
 * стану синку перекриває локальну мітку тими самими правилами, що
 * `applyMonoServerConnectedAt`: `undefined` — стану ще немає, `null` —
 * підключення немає, нерозбірний рядок не рахується. Читаємо кеш напряму,
 * а не лише мітку: ефект, що пише мітку (`useMonobankWebhook`), спрацьовує
 * вже після рендеру картки, і картка лишалась би на старому значенні.
 */
export function resolveMonoConnectedAt(
  serverConnectedAt: string | null | undefined,
): number | null {
  if (serverConnectedAt === null) return null;
  if (serverConnectedAt !== undefined) {
    const ms = Date.parse(serverConnectedAt);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return getMonoFirstConnectedAt();
}

export function useBankHistoryFactLines(enabled: boolean): string[] {
  // Лише підписка на кеш: запит робить `useMonobankWebhook`, тут без
  // `queryFn` і з `enabled: false`, щоб не дублювати мережу.
  const { data: syncState } = useQuery<MonoSyncState>({
    queryKey: finykKeys.monoSyncState,
    enabled: false,
  });
  const serverConnectedAt = syncState ? syncState.connectedAt : undefined;
  const mirror = useFinykMirrorTransactions();
  const { statTransactions, slots } = useFinykStatTransactions();
  const { txCategories, txSplits, customCategories } = slots;
  const hidden = isFinykBalanceHidden();
  return useMemo(() => {
    // Без дзеркала банку Monobank не підключено: «історії банку» немає,
    // навіть якщо є ручні записи.
    if (!enabled || mirror.length === 0) return [];
    if (!isWithinBankFactsWindow(resolveMonoConnectedAt(serverConnectedAt))) {
      return [];
    }
    const facts = buildBankHistoryFacts(statTransactions, {
      txCategories,
      txSplits,
      customCategories,
      historyStartKey: getFinykBankHistoryStart(),
    });
    return formatBankHistoryFacts(facts, hidden);
  }, [
    enabled,
    serverConnectedAt,
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
