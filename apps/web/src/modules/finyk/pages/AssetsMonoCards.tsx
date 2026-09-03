import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { Switch } from "@shared/components/ui/Switch";
import { Badge } from "@shared/components/ui/Badge";
import { AssetsGroupCard, usePersistedGroupOpen } from "./AssetsGroupCard";
import { cn } from "@shared/lib/ui/cn";
import { Money } from "@shared/components/ui/Money";
import { getAccountVisual } from "../lib/accountVisual";
import {
  getMonoDebt,
  getMonoOwnFunds,
} from "@sergeant/finyk-domain/lib/accounts";
import { messages } from "@shared/i18n/uk";

const t = messages.finyk.monoCards;

/**
 * Список карток Monobank у Активах + аркуш «Враховувати картку».
 *
 * AI-CONTEXT: вимкнена картка НЕ зникає зі списку — інакше тумблер не було б
 * як повернути назад. Вона лишається видимою, приглушеною і підписаною
 * «Не враховується»; сам факт виключення живе в `finyk_hidden`
 * (`storage.hiddenAccounts`) і застосовується до балансів у `getMonoTotals`
 * та до транзакцій у `useUnifiedFinanceData`.
 */

interface CardAccount {
  id?: string | undefined;
  balance?: number | undefined;
  creditLimit?: number | undefined;
  currencyCode?: number | undefined;
  type?: string | undefined;
  maskedPan?: unknown;
  [extra: string]: unknown;
}

function currencySymbol(code: number | undefined): string {
  if (code === 980) return "₴";
  if (code === 840) return "$";
  return "€";
}

function firstMaskedPan(account: CardAccount): string | undefined {
  const pans = account.maskedPan;
  if (!Array.isArray(pans)) return undefined;
  const first = pans[0];
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

export function AssetsMonoCards({
  accounts,
  hiddenAccounts,
  toggleHideAccount,
  showBalance,
}: {
  accounts: readonly CardAccount[];
  hiddenAccounts: readonly string[];
  toggleHideAccount: (id: string) => void;
  showBalance: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [groupOpen, toggleGroup] = usePersistedGroupOpen(
    "finyk_assets_mono_cards_open_v1",
  );

  const openAccount = accounts.find((a) => a.id === openId);
  const openVisual = openAccount ? getAccountVisual(openAccount) : null;
  const openIncluded = openId !== null && !hiddenAccounts.includes(openId);

  return (
    <AssetsGroupCard
      title={t.sectionTitle}
      iconName="credit-card"
      iconClassName="text-muted"
      open={groupOpen}
      onToggle={toggleGroup}
    >
      {accounts.map((a, i) => {
        const visual = getAccountVisual(a);
        const id = a.id ?? "";
        const included = !hiddenAccounts.includes(id);
        const isCredit = (a.creditLimit ?? 0) > 0;
        // Кредитка: «Активи» показує лише власні кошти понад ліміт
        // (getMonoOwnFunds), не сирий balance — інакше сума виглядає
        // задвоєною з боргом кредитки у «Пасивах» (F-decision 1).
        const displayBalance = isCredit ? getMonoOwnFunds(a) : (a.balance ?? 0);
        // `getMonoDebt` повертає ГРИВНІ (вже поділені на 100), на відміну
        // від `getMonoOwnFunds`, що віддає копійки. Тому тут без /100.
        const creditDebt = isCredit ? getMonoDebt(a) : 0;
        return (
          <button
            key={id || i}
            type="button"
            disabled={id === ""}
            onClick={() => setOpenId(id)}
            aria-label={`${visual.name}: ${t.settingsAriaSuffix}`}
            className={cn(
              "touch-target flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3 text-left transition-colors",
              "hover:bg-panelHi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
              !included && "opacity-50",
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={cn(
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                  visual.tone,
                )}
                aria-hidden
              >
                <Icon name={visual.iconName} size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-style-label truncate">{visual.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-style-caption text-subtle">
                    {included ? t.bankLabel : t.excluded}
                  </span>
                  {isCredit && (
                    <Badge variant="warning" size="xs">
                      {t.creditLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-style-label tabular-nums text-text">
                {showBalance ? (
                  // `kopecks` увімкнено навмисно: це залишок на рахунку
                  // банку, де копійка — частина факту, а не шум. На
                  // зведених сумах (капітал, підсумки) вона вимкнена.
                  <Money
                    amount={displayBalance / 100}
                    kopecks
                    symbol={currencySymbol(a.currencyCode)}
                  />
                ) : (
                  "••••"
                )}
              </div>
              {/*
                Кредитка з боргом інакше читається як порожня картка:
                зверху чесний 0 (власних коштів понад ліміт справді
                немає), а сам борг лежить у «Пасивах» без жодного
                натяку тут. Припис — місток між двома числами, а не
                друга сума: `getMonoDebt` тут ЛИШЕ показується, у
                капітал він входить рівно один раз, через
                `getMonoTotals().debt`.

                Ховається разом із балансом: під `showBalance = false`
                борг — така сама приватна цифра, як і залишок.
              */}
              {showBalance && creditDebt > 0 && (
                <div className="text-style-caption text-warning-strong dark:text-warning mt-0.5">
                  {t.debtHintPrefix}{" "}
                  <Money
                    amount={creditDebt}
                    tone="inherit"
                    symbol={currencySymbol(a.currencyCode)}
                  />{" "}
                  {t.debtHintSuffix}
                </div>
              )}
            </div>
          </button>
        );
      })}

      <Sheet
        open={openAccount != null}
        onClose={() => setOpenId(null)}
        title={openVisual?.name ?? t.fallbackName}
        {...(openAccount && firstMaskedPan(openAccount)
          ? { description: firstMaskedPan(openAccount) }
          : {})}
      >
        <Switch
          checked={openIncluded}
          onChange={() => {
            if (openId) toggleHideAccount(openId);
          }}
          label={t.includeLabel}
          description={t.includeHint}
        />
      </Sheet>
    </AssetsGroupCard>
  );
}
