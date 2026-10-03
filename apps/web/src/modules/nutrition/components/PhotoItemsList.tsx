/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Список позицій фото-аналізу з можливістю прибрати хибну.
 *
 * AI-CONTEXT: живе окремим файлом навмисно. `PhotoAnalyzeCard.tsx` стоїть на
 * 559 рядках при стелі 600 (Hard Rule #18), тож розмітка списку туди не
 * влізла б — ініціатива 0023 прямо називає винесення умовою, а не наслідком
 * почервонілого лінта.
 *
 * Підсумок картки рахується з цього ж масиву тією самою `sumMacrosNullable`,
 * що й на сервері: якби число жило окремо, прибирання рядка нічого б у ньому
 * не змінило — саме той баг, від якого тікає ініціатива.
 */
import { useState } from "react";
import type { NutritionPhotoItem } from "@shared/api";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useLocale } from "@shared/i18n/useLocale";

/**
 * Нижче цього порогу позиція показує застереження.
 *
 * 0.5 — той самий поріг, яким зоровий стенд (`scripts/eval/vision.ts`,
 * `hedged`) уже вважає відповідь невпевненою. Тримаємо одне число на обидва
 * шляхи, щоб «низька впевненість» не означала різне в замірі й на екрані.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

interface PhotoItemsListProps {
  items: NutritionPhotoItem[];
  fmtMacro: (v: unknown) => string | number;
  /** Прибрати позицію за індексом. Відсутній — список лише для читання. */
  onRemoveItem?: ((index: number) => void) | undefined;
  /**
   * Пікер каталогу під кнопкою «Додати позицію». Рендер-функція, а не готовий
   * вузол: стан розкриття живе тут, тож `close` мусить прийти згори вниз —
   * інакше «Скасувати» всередині пікера не має чим згорнути кнопку назад.
   */
  renderAddItem?: ((close: () => void) => React.ReactNode) | undefined;
  busy?: boolean | undefined;
}

export function PhotoItemsList({
  items,
  fmtMacro,
  onRemoveItem,
  renderAddItem,
  busy,
}: PhotoItemsListProps) {
  const [addOpen, setAddOpen] = useState(false);
  const { messages } = useLocale();
  const copy = messages.nutrition.photoItems;
  if (!items.length && !renderAddItem) return null;

  return (
    <div className="grid gap-2">
      <SectionHeading as="div" size="xs" variant="nutrition">
        {copy.heading}
      </SectionHeading>

      <ul className="grid gap-1.5">
        {items.map((item, index) => {
          const lowConfidence = item.confidence < LOW_CONFIDENCE_THRESHOLD;
          return (
            <li
              key={`${item.name}-${index}`}
              className="flex items-start gap-2 rounded-xl border border-line bg-panel px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-style-label text-text truncate">
                    {item.name}
                  </span>
                  {item.gramsApprox != null && (
                    <span className="text-style-caption text-subtle shrink-0">
                      {`~${Math.round(item.gramsApprox)} ${copy.gramsUnit}`}
                    </span>
                  )}
                </div>
                <div className="text-style-caption text-muted mt-0.5">
                  {`${fmtMacro(item.macros.kcal)} ${copy.kcalUnit} · ` +
                    `${fmtMacro(item.macros.protein_g)}/` +
                    `${fmtMacro(item.macros.fat_g)}/` +
                    `${fmtMacro(item.macros.carbs_g)} ${copy.gramsUnit}`}
                </div>
                {lowConfidence && (
                  // Позначка веде до дії, а не просто фарбує рядок: людина
                  // має зрозуміти, що виправляти слід саме цю позицію.
                  <div className="text-style-caption text-warning-strong dark:text-warning mt-0.5">
                    {copy.lowConfidence}
                  </div>
                )}
              </div>

              {onRemoveItem && (
                <button
                  type="button"
                  onClick={() => onRemoveItem(index)}
                  disabled={busy}
                  aria-label={`${copy.removePrefix} «${item.name}»`}
                  className={cn(
                    "touch-target shrink-0 -mr-1 rounded-xl text-muted",
                    "hover:text-danger-strong disabled:opacity-50 transition-colors",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                    "inline-flex items-center justify-center",
                  )}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {renderAddItem &&
        (addOpen ? (
          renderAddItem(() => setAddOpen(false))
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={busy}
            className={cn(
              "touch-target text-style-caption w-full rounded-xl border border-dashed border-line",
              "px-3 text-muted hover:border-nutrition/40 hover:text-text disabled:opacity-50 transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
            )}
          >
            {copy.addCta}
          </button>
        ))}
    </div>
  );
}
