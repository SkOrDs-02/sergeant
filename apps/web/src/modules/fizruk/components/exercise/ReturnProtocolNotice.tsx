/**
 * Last validated: 2026-08-02
 * Status: Active
 *
 * Протокол повернення — окремий продуктовий стан (канон `fizruk.md` §6).
 *
 * AI-CONTEXT: канон дослівно: «Повернення — це окремий продуктовий стан, а не
 * просто "продовжуй, де зупинився"». Раніше після трьох тижнів перерви
 * сторінка вправи показувала калькулятор від піка й банер рекорду — рівно те,
 * чого founder хоче уникнути. Ця картка й є той стан: вона пояснює, ЧОМУ
 * орієнтир нижчий за рекорд, і робить це без докору (пауза не провал).
 *
 * Витягнуто окремим компонентом, бо `pages/Exercise.tsx` уже близько до
 * стелі `max-lines: 600` (Hard Rule #18).
 */
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { messages } from "@shared/i18n/uk";
import type { OneRmAging } from "@sergeant/fizruk-domain/domain";

export interface ReturnProtocolNoticeProps {
  aging: OneRmAging;
}

export function ReturnProtocolNotice({ aging }: ReturnProtocolNoticeProps) {
  if (!aging.returnMode) return null;
  const t = messages.fizruk.oneRmAging;
  const injury = aging.returnReason === "injury";

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-info/40 bg-info/10 px-4 py-3">
      <Icon name="info" size={20} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-style-label text-info-strong dark:text-info">
          {injury ? t.injuryTitle : t.staleTitle}
        </p>
        <p className="text-style-caption text-info-strong dark:text-info">
          {injury ? t.injuryNote : t.staleNote}
        </p>
        <p className="text-style-caption text-subtle mt-1 tabular-nums">
          {t.referenceLabel}:{" "}
          <Measure value={aging.reference1rm} unit={t.kgUnit} />
          {aging.reductionPct > 0
            ? ` · −${aging.reductionPct}% ${t.reducedSuffix}`
            : ""}
          {aging.daysSinceLastSession !== null
            ? ` · ${t.lastSessionPrefix} ${aging.daysSinceLastSession} ${t.daysAgoSuffix}`
            : ""}
        </p>
      </div>
    </div>
  );
}
