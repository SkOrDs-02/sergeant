/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Аркуш готовності перед стартом тренування.
 *
 * Спека: docs/work/specs/fizruk-readiness-check.md
 *
 * AI-CONTEXT: аркуш НЕ вирішує за людину. Він збирає дві оцінки, а рішення,
 * чи зʼявиться друга кнопка на картці вправи, ухвалює домен
 * (`classifyReadiness` + `suggestNextSet`). Тут навмисно немає ані порогів,
 * ані формул: продублювати їх у компоненті означало б завести друге джерело
 * істини, яке розійдеться з першим при першому ж калібруванні.
 *
 * Пропустити можна завжди, і це не «поганий» шлях: без відповіді картка
 * вправи виглядає рівно як до появи цієї фічі.
 *
 * Оболонка — спільний `Sheet`: він сам відступає від нижнього таббара й
 * safe-area, тож футер із «Готово» не ховається під навбар (звіт 2026-09-03:
 * власний fixed-оверлей цього не робив, і кнопку не можна було натиснути).
 */
import { useId, useState } from "react";

import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { Sheet } from "@shared/components/ui/Sheet";
import { messages } from "@shared/i18n/uk";

export interface ReadinessSheetProps {
  open: boolean;
  /** `null` у полі = людина його не чіпала; аркуш не підставляє дефолтів. */
  onSubmit: (answer: { sleep: number | null; soreness: number | null }) => void;
  onSkip: () => void;
}

const SCALE = ["1", "2", "3", "4", "5"] as const;

/** Один рядок шкали 1-5. Винесено, бо той самий блок малюється двічі. */
function ScaleRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: number | null;
  onPick: (n: number) => void;
}) {
  const t = messages.fizruk.readiness;
  const labelId = useId();
  return (
    <div>
      <div id={labelId} className={`${FIELD_LABEL} mb-2`}>
        {label}
      </div>
      <ChoiceGroup
        size="sm"
        className="grid grid-cols-5"
        ariaLabelledBy={labelId}
        value={value == null ? null : String(value)}
        onChange={(n) => onPick(Number(n))}
        items={SCALE.map((n) => ({
          value: n,
          label: n,
          ariaLabel: `${label} ${n}`,
        }))}
      />
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
  const t = messages.fizruk.readiness;

  return (
    // Закрити (хрестик, скрим, Escape) = пропустити: аркуш не має способу
    // «скасувати в нікуди», бо тренування вже почалось.
    <Sheet
      open={open}
      onClose={onSkip}
      title={t.title}
      description={t.subtitle}
      panelClassName="fizruk-sheet"
      footer={
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-12 min-h-[44px]"
            type="button"
            onClick={onSkip}
          >
            {t.skip}
          </Button>
          <Button
            variant="solid"
            className="flex-1 h-12 min-h-[44px]"
            type="button"
            // Порожня відповідь дозволена і дорівнює пропуску: домен читає
            // `null` як «нема даних», а не як «погано».
            onClick={() => onSubmit({ sleep, soreness })}
          >
            {t.submit}
          </Button>
        </div>
      }
    >
      {/* Аркуш відкривається сам, без дії людини, тож початковий фокус
          стоїть на вмісті, а не на «Закрити»: інакше рамка фокуса горить на
          хрестику ще до першого дотику. */}
      <div
        className="space-y-4 focus:outline-none"
        tabIndex={-1}
        data-autofocus
      >
        <ScaleRow label={t.sleepLabel} value={sleep} onPick={setSleep} />
        <ScaleRow
          label={t.sorenessLabel}
          value={soreness}
          onPick={setSoreness}
        />
      </div>
    </Sheet>
  );
}
