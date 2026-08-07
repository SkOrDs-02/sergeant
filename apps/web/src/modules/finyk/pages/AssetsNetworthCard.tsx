import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
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
        <p className="text-style-label text-muted inline-flex items-center gap-1.5">
          <Icon name="wallet" size={14} aria-hidden />
          Загальний капітал
        </p>
        <div
          className={cn(
            "text-style-display tnum mt-2 flex items-center gap-1.5",
            isNegative
              ? "text-danger-strong dark:text-danger"
              : "text-finyk-strong dark:text-finyk",
            !showBalance && "tracking-widest",
          )}
        >
          {showBalance ? (
            /*
              AI-CONTEXT: до 2026-08-06 тут стояла САМОРОБНА обробка тирів —
              одометр для цілого плюс окремий `span` із власним кеглем і
              власним приглушеним кольором для ₴. Тобто дубль того, що
              робить `Money`, на найпомітнішому числі застосунку: свої
              пропорції, свій тон, без вузького нерозривного перед символом.

              Одометр пішов не заради спрощення, а за рішенням власника по
              П5 (варіант C): рух читає СТРУКТУРУ числа — у тирного числа
              каскад, у без-тирного відлік. Капітал має тири, отже каскад.
              Лічильник тут був найсильнішим аргументом «виглядає однаково
              в будь-якому дашборді».

              Заразом зник `role="img"` з `aria-label`: він існував лише
              тому, що барабани одометра доводилось ховати від скрінрідера
              (цифри, що крутяться, читались би як шум). Каскад — звичайний
              текст, і його читають як текст.
            */
            <Money amount={networth} animate tone="inherit" />
          ) : (
            "\u2022\u2022\u2022\u2022\u2022\u2022"
          )}
        </div>
        {showBalance ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-finyk/20 text-sm">
            <div>
              <div className="text-style-caption text-subtle mb-0.5">
                Активи
              </div>
              <div className="font-semibold tabular-nums text-text">
                <Money amount={totalAssets} signed tone="inherit" />
              </div>
            </div>
            <div className="w-px bg-finyk/20 hidden sm:block self-stretch min-h-10" />
            <div>
              <div className="text-style-caption text-subtle mb-0.5">
                Пасиви
              </div>
              <div className="font-semibold tabular-nums text-text">
                <Money amount={-totalDebt} tone="inherit" />
              </div>
            </div>
          </div>
        ) : (
          <p className="text-style-caption text-muted mt-3">Суми приховано</p>
        )}
        {showBalance && totalAssets + totalDebt > 0 && (
          <AssetsLiabilitiesBar assets={totalAssets} liabilities={totalDebt} />
        )}
      </div>
    </div>
  );
}
