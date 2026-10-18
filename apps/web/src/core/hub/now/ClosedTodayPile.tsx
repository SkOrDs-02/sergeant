/**
 * Купа «Закрито» — друга купа осі дії (A1, спека `hub-action-axis.md`), у
 * формі мови H (redesign v3): заголовок `muted`, рядки 34 px — чекбокс-on
 * 18 px, назва 600, факт другим сірим. Порожня купа не рендериться:
 * «закрито 0» — це не стан, а відсутність.
 *
 * Три джерела рядків: твердження модулів (`closedToday.ts`, одне на
 * активний модуль; тап відкриває модуль), зроблені кроки онбордингу і
 * пункти «Зараз», закриті сьогодні чекбоксом (тап повертає пункт у «Зараз»).
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useMemo, type ReactNode } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { coreMessages } from "@shared/i18n/uk.core";
import { computeClosedToday } from "./closedToday";
import { usePublishHubDayCount } from "./hubDayCounts";
import type { ChecklistNowProps } from "./ChecklistNowRows";
import type { NowItem } from "./nowItems";
import type { Rec } from "../../lib/recommendationEngine";

export interface ClosedTodayPileProps {
  activeModules: readonly string[];
  recs: readonly Rec[];
  onOpenModule: (module: string) => void;
  /** Тік сховища з батька — перерахувати після запису в модулі. */
  storageBump?: number | undefined;
  /** Зроблені кроки онбордингу: рядки «Закрито», поки триває вікно. */
  checklistDone?: ChecklistNowProps | undefined;
  /** Пункти «Зараз», закриті сьогодні чекбоксом. */
  checked?: readonly NowItem[] | undefined;
  /** Повертає закритий пункт у «Зараз». */
  onUncheck?: ((item: NowItem) => void) | undefined;
}

function CheckOn() {
  return (
    <span
      aria-hidden
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] bg-text text-bg"
    >
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12 L10 17 L19 7" />
      </svg>
    </span>
  );
}

function RowBody({ name, fact }: { name: string; fact?: ReactNode }) {
  return (
    <>
      <CheckOn />
      <span className="min-w-0 flex-1 truncate text-style-body">
        <span className="font-semibold text-text">{name}</span>
        {fact ? <span className="ml-2 text-muted">{fact}</span> : null}
      </span>
    </>
  );
}

const ROW =
  "flex min-h-[34px] w-full items-center gap-2.5 text-left focus-ring touch-target";

export function ClosedTodayPile({
  activeModules,
  recs,
  onOpenModule,
  storageBump,
  checklistDone,
  checked = [],
  onUncheck,
}: ClosedTodayPileProps) {
  const items = useMemo(() => {
    void storageBump; // storage-write tick — перерахувати після запису
    return computeClosedToday({ activeModules, recs });
  }, [activeModules, recs, storageBump]);
  const doneSteps = checklistDone?.steps ?? [];
  const count = items.length + doneSteps.length + checked.length;
  usePublishHubDayCount("closed", count);
  if (count === 0) return null;

  return (
    <section aria-labelledby="closed-pile-heading">
      <SectionHeading
        as="h2"
        size="lg"
        variant="muted"
        id="closed-pile-heading"
        meta={count}
      >
        {coreMessages.hub.closedPile.heading}
      </SectionHeading>
      <ul className="mt-1">
        {items.map((item) => (
          <li key={item.module}>
            <button
              type="button"
              data-testid="closed-row"
              onClick={() => onOpenModule(item.module)}
              className={ROW}
            >
              <RowBody
                name={item.label}
                fact={
                  item.value
                    ? `${item.statement} · ${item.value}`
                    : item.statement
                }
              />
            </button>
          </li>
        ))}
        {doneSteps.map((step) => (
          <li key={step.id} data-testid="closed-checklist-row" className={ROW}>
            <RowBody name={step.label} />
          </li>
        ))}
        {checked.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              role="checkbox"
              aria-checked
              data-testid="closed-now-row"
              aria-label={`${coreMessages.hub.closedPile.uncheck}: ${item.title}`}
              onClick={() => onUncheck?.(item)}
              className={ROW}
            >
              <RowBody name={item.title} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
