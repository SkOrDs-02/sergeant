import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { AssetsLiabilitiesBar } from "./AssetsBars";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

export function AssetsNetworthCard({
  networth,
  totalAssets,
  totalDebt,
  showBalance,
}: Pick<State, "networth" | "totalAssets" | "totalDebt" | "showBalance">) {
  const isNegative = networth < 0;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border p-5 mb-3 shadow-soft",
        "bg-finyk/5 dark:bg-finyk-surface-dark/10 border-finyk/15 dark:border-finyk-border-dark/20",
        "before:absolute before:inset-0 before:pointer-events-none before:bg-linear-to-br",
        isNegative
          ? "before:from-danger/5 before:via-transparent before:to-transparent"
          : "before:from-finyk/10 before:via-transparent before:to-transparent",
      )}
    >
      <div className="relative">
        <p className="text-sm text-muted inline-flex items-center gap-1.5">
          <Icon name="wallet" size={14} aria-hidden />
          Загальний нетворс
        </p>
        <div
          className={cn(
            "text-display-stat mt-2",
            isNegative
              ? "text-danger-strong dark:text-danger"
              : "text-finyk-strong dark:text-finyk",
            !showBalance && "tracking-widest",
          )}
        >
          {showBalance ? (
            <>
              {networth.toLocaleString("uk-UA", { maximumFractionDigits: 0 })}
              <span
                className={cn(
                  "text-2xl font-semibold ml-1",
                  isNegative ? "text-danger/60" : "text-finyk/60",
                )}
              >
                ₴
              </span>
            </>
          ) : (
            "\u2022\u2022\u2022\u2022\u2022\u2022"
          )}
        </div>
        {showBalance ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-finyk/20 text-sm">
            <div>
              <div className="text-xs text-subtle mb-0.5">Активи</div>
              <div className="font-semibold tabular-nums text-text">
                {`+${totalAssets.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`}
              </div>
            </div>
            <div className="w-px bg-finyk/20 hidden sm:block self-stretch min-h-10" />
            <div>
              <div className="text-xs text-subtle mb-0.5">Пасиви</div>
              <div className="font-semibold tabular-nums text-text">
                {`\u2212${totalDebt.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted mt-3">Суми приховано</p>
        )}
        {showBalance && totalAssets + totalDebt > 0 && (
          <AssetsLiabilitiesBar assets={totalAssets} liabilities={totalDebt} />
        )}
      </div>
    </div>
  );
}
