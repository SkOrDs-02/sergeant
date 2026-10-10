import { Card } from "@shared/components/ui/Card";
import { pluralUa } from "@sergeant/shared";

import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { AssetsLiabilitiesBar } from "./AssetsBars";
import type { useAssetsState } from "./useAssetsState";

type State = ReturnType<typeof useAssetsState>;

export function AssetsNetworthCard({
  networth,
  totalAssets,
  totalDebt,
  showBalance,
  nonUahManualAssetCount = 0,
}: Pick<State, "networth" | "totalAssets" | "totalDebt" | "showBalance"> & {
  nonUahManualAssetCount?: number;
}) {
  return (
    <Card
      prominence={totalAssets + totalDebt > 0 ? "hero" : "panel"}
      tone="finyk"
      padding="lg"
      className="mb-3 text-text"
    >
      <div className="relative">
        {/* H.2: число й підписи на тинті чорнилом; ієрархію несуть розмір і вага. */}
        <div
          className={cn(
            "text-style-display tnum flex items-center gap-1.5",
            "text-text",
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
        <p className="text-style-label text-text mt-1 inline-flex items-center gap-1.5">
          Загальний капітал
        </p>
        {nonUahManualAssetCount > 0 && (
          <p className="text-style-caption text-text mt-1">
            {nonUahManualAssetCount}{" "}
            {pluralUa(
              nonUahManualAssetCount,
              messages.finyk.nonUahAssetsExcluded,
            )}
          </p>
        )}
        {showBalance ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-line text-style-label">
            <div>
              <div className="font-semibold tabular-nums text-text">
                <Money amount={totalAssets} signed tone="inherit" />
              </div>
              <div className="text-style-caption text-text mt-0.5">Активи</div>
            </div>
            <div className="w-px bg-panel hidden sm:block self-stretch min-h-10" />
            <div>
              <div className="font-semibold tabular-nums text-text">
                <Money amount={-totalDebt} tone="inherit" />
              </div>
              <div className="text-style-caption text-text mt-0.5">Пасиви</div>
            </div>
          </div>
        ) : (
          <p className="text-style-caption text-text mt-3">Суми приховано</p>
        )}
        {showBalance && totalAssets + totalDebt > 0 && (
          <AssetsLiabilitiesBar assets={totalAssets} liabilities={totalDebt} />
        )}
      </div>
    </Card>
  );
}
