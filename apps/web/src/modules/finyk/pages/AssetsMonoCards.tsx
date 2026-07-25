import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { Sheet } from "@shared/components/ui/Sheet";
import { Switch } from "@shared/components/ui/Switch";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { cn } from "@shared/lib/ui/cn";
import { getAccountVisual } from "../lib/accountVisual";
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

  const openAccount = accounts.find((a) => a.id === openId);
  const openVisual = openAccount ? getAccountVisual(openAccount) : null;
  const openIncluded = openId !== null && !hiddenAccounts.includes(openId);

  return (
    <CollapsibleSection
      storageKey="finyk_assets_mono_cards_open_v1"
      title={t.sectionTitle}
      headingSize="sm"
      collapsedIcon="credit-card"
    >
      {accounts.map((a, i) => {
        const visual = getAccountVisual(a);
        const id = a.id ?? "";
        const included = !hiddenAccounts.includes(id);
        return (
          <button
            key={id || i}
            type="button"
            disabled={id === ""}
            onClick={() => setOpenId(id)}
            aria-label={`${visual.name} — ${t.settingsAriaSuffix}`}
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
                <div className="text-style-caption text-subtle mt-0.5">
                  {included ? t.bankLabel : t.excluded}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-style-label tabular-nums text-text">
                {showBalance
                  ? `${((a.balance ?? 0) / 100).toLocaleString("uk-UA", {
                      minimumFractionDigits: 2,
                    })} ${currencySymbol(a.currencyCode)}`
                  : "••••"}
              </div>
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
    </CollapsibleSection>
  );
}
