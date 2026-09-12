import { Icon } from "@shared/components/ui/Icon";
import { AssetsGroupCard, usePersistedGroupOpen } from "./AssetsGroupCard";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import type { JarLike } from "./useAssetsState";

const t = messages.finyk.monoJars;

/**
 * Підсекція «Активів» — банки Monobank («банка»). На відміну від карток
 * (`AssetsMonoCards`), банки не мають тумблера «Враховувати» — їхній баланс
 * завжди йде в капітал (F-decision 2: `computeAssetsSummary`'s `jarsTotal`),
 * тож секція суто інформаційна. Порожній список банок ховає секцію цілком,
 * бо це не рахунок, який юзер міг би додати вручну — банки приходять лише
 * з підключеного Monobank.
 */

function currencySymbol(code: number | undefined): string {
  if (code === 980) return "₴";
  if (code === 840) return "$";
  return "€";
}

export function AssetsMonoJars({
  jars,
  showBalance,
}: {
  // Optional: старі виклики/тест-фікстури AssetsAssetsSection можуть не
  // передавати jars (стан без підключеного Monobank) — це те саме, що
  // порожній список.
  jars?: readonly JarLike[] | undefined;
  showBalance: boolean;
}) {
  const [groupOpen, toggleGroup] = usePersistedGroupOpen(
    "finyk_assets_mono_jars_open_v1",
  );
  if (!jars || jars.length === 0) return null;

  return (
    <AssetsGroupCard
      title={t.sectionTitle}
      iconName="piggy-bank"
      iconClassName="text-muted"
      open={groupOpen}
      onToggle={toggleGroup}
    >
      {jars.map((j, i) => {
        const id = j.monoJarId ?? j.id ?? String(i);
        const balance = j.balance ?? 0;
        const goal = j.goal ?? null;
        const goalPct =
          goal && goal > 0
            ? Math.min(100, Math.round((balance / goal) * 100))
            : null;
        return (
          <div
            key={id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/60 p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl shrink-0 bg-finyk/10 text-finyk-strong dark:bg-finyk/15 dark:text-finyk"
                aria-hidden
              >
                <Icon name="piggy-bank" size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-style-label truncate">
                  {j.title?.trim() || t.fallbackName}
                </div>
                {goalPct !== null && (
                  <div className="text-style-caption text-subtle mt-0.5">
                    {goalPct}% {t.goalCaptionSuffix}
                  </div>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-style-label tabular-nums text-text">
                {showBalance ? (
                  // Копійки увімкнено з тієї ж причини, що й на картках:
                  // це залишок на рахунку банку, а не зведена сума.
                  <Money
                    amount={balance / 100}
                    kopecks
                    symbol={currencySymbol(j.currencyCode)}
                  />
                ) : (
                  "••••"
                )}
              </div>
            </div>
          </div>
        );
      })}
    </AssetsGroupCard>
  );
}
