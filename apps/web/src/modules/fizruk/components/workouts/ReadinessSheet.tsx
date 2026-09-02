/**
 * Last validated: 2026-09-02
 * Status: Active
 *
 * Аркуш готовності перед стартом тренування.
 *
 * Спека: docs/90-work/planning/specs/fizruk-readiness-check.md
 *
 * AI-CONTEXT: аркуш НЕ вирішує за людину. Він збирає дві оцінки, а рішення,
 * чи зʼявиться друга кнопка на картці вправи, ухвалює домен
 * (`classifyReadiness` + `suggestNextSet`). Тут навмисно немає ані порогів,
 * ані формул: продублювати їх у компоненті означало б завести друге джерело
 * істини, яке розійдеться з першим при першому ж калібруванні.
 *
 * Пропустити можна завжди, і це не «поганий» шлях: без відповіді картка
 * вправи виглядає рівно як до появи цієї фічі.
 */
import { useRef, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { cn } from "@shared/lib/ui/cn";

export interface ReadinessSheetProps {
  open: boolean;
  /** `null` у полі = людина його не чіпала; аркуш не підставляє дефолтів. */
  onSubmit: (answer: { sleep: number | null; soreness: number | null }) => void;
  onSkip: () => void;
}

const SCALE = [1, 2, 3, 4, 5] as const;

/** Один рядок шкали 1-5. Винесено, бо той самий блок малюється двічі. */
function ScaleRow({
  idPrefix,
  label,
  value,
  onPick,
}: {
  idPrefix: string;
  label: string;
  value: number | null;
  onPick: (n: number) => void;
}) {
  const t = messages.fizruk.readiness;
  return (
    <div>
      <SectionHeading as="div" size="xs" variant="fizruk" className="mb-2">
        {label}
      </SectionHeading>
      <div className="flex flex-wrap items-center gap-2">
        {SCALE.map((n) => (
          <button
            key={`${idPrefix}${n}`}
            type="button"
            className={cn(
              "min-w-[44px] min-h-[44px] rounded-xl border text-style-label transition-colors",
              value === n
                ? "bg-text text-bg border-text"
                : "border-line bg-bg text-muted hover:border-muted",
            )}
            onClick={() => onPick(n)}
            aria-pressed={value === n}
            aria-label={`${label} ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-style-caption text-subtle">
        <span>{t.scaleLow}</span>
        <span>{t.scaleHigh}</span>
      </div>
    </div>
  );
}

export function ReadinessSheet({
  open,
  onSubmit,
  onSkip,
}: ReadinessSheetProps) {
  const [sleep, setSleep] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const trapRef = useRef<HTMLDivElement | null>(null);
  // Escape = пропустити: аркуш не має способу «скасувати в нікуди», бо
  // тренування вже почалось.
  useDialogFocusTrap(open, trapRef, { onEscape: onSkip });
  const t = messages.fizruk.readiness;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      aria-label={t.title}
    >
      <div
        ref={trapRef}
        className="pointer-events-auto max-w-md w-full mx-auto fizruk-sheet"
      >
        <Card
          prominence="elevated"
          radius="lg"
          className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fizruk-readiness-title"
        >
          <div
            id="fizruk-readiness-title"
            className="text-style-label text-text"
          >
            {t.title}
          </div>
          <p className="text-style-caption text-subtle leading-relaxed">
            {t.subtitle}
          </p>

          <ScaleRow
            idPrefix="sleep"
            label={t.sleepLabel}
            value={sleep}
            onPick={setSleep}
          />
          <ScaleRow
            idPrefix="soreness"
            label={t.sorenessLabel}
            value={soreness}
            onPick={setSoreness}
          />

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1 h-12 min-h-[44px]"
              type="button"
              onClick={onSkip}
            >
              {t.skip}
            </Button>
            <Button
              variant="primary"
              className="flex-1 h-12 min-h-[44px]"
              type="button"
              // Порожня відповідь дозволена і дорівнює пропуску: домен читає
              // `null` як «нема даних», а не як «погано».
              onClick={() => onSubmit({ sleep, soreness })}
            >
              {t.submit}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
