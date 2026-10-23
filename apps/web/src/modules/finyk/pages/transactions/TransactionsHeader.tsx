import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n";
import {
  MonthPickSheet,
  PeriodNav,
} from "../../components/analytics/PeriodNav";

export interface TransactionsHeaderProps {
  monthLabel: string;
  isCurrentMonth: boolean;
  goMonth: (delta: number) => void;
  selectMode: boolean;
  exitSelectMode: () => void;
  setSelectMode: (v: boolean) => void;
  showHidden: boolean;
  setShowHidden: (updater: (v: boolean) => boolean) => void;
  hiddenCount: number;
  /** Batch selection size — drives the inline "Обери транзакції" hint. */
  selectedCount?: number;
  /**
   * Вивантажити видимі операції у CSV. Без колбека кнопка не рендериться:
   * експортувати нема чого.
   */
  onExportCsv?: (() => void) | undefined;
  /**
   * Скільки рядків піде у файл. `0` ховає кнопку — порожній CSV із самою
   * шапкою виглядає як поламаний експорт, а не як порожній місяць.
   */
  exportCount?: number;
  /** Підписи місяців від поточного назад для аркуша вибору. */
  recentMonths?: readonly string[];
  /** Скільки місяців тому обраний місяць. */
  monthsBack?: number;
}

const copy = messages.finyk.analyticsPage;

/**
 * Top header for the Transactions page: month switcher on the left,
 * action buttons (toggle-hidden / select-mode) on the right.
 *
 * The "select-mode" toggle replaces the action cluster with a single
 * "Скасувати" button while batch selection is active — the actions
 * only make sense outside of select-mode anyway. Manual refresh lives in
 * Hub → Налаштування → Фінік → Сервіс (mono webhook means data already
 * refetches on focus / staleness; the manual button is a fallback).
 */
export function TransactionsHeader({
  monthLabel,
  isCurrentMonth,
  goMonth,
  selectMode,
  exitSelectMode,
  setSelectMode,
  showHidden,
  setShowHidden,
  hiddenCount,
  selectedCount = 0,
  onExportCsv,
  exportCount = 0,
  recentMonths = [monthLabel],
  monthsBack = 0,
}: TransactionsHeaderProps) {
  const [picking, setPicking] = useState(false);
  return (
    // На 360 px навігація місяцем і три текст-кнопки («N прих.», «CSV»,
    // «Вибрати») у ряд не вміщаються, тож дії переносяться під місяць.
    <div className="flex flex-wrap items-center justify-between gap-x-2 mb-3">
      <PeriodNav
        label={monthLabel}
        prevAria={copy.prev.month}
        nextAria={copy.next.month}
        pickAria={copy.choosePeriod}
        onPrev={() => goMonth(-1)}
        onNext={() => goMonth(1)}
        onPick={() => setPicking(true)}
        nextDisabled={isCurrentMonth}
      />
      {picking && (
        <MonthPickSheet
          months={recentMonths}
          selectedBack={monthsBack}
          onClose={() => setPicking(false)}
          onPick={(back) => {
            setPicking(false);
            if (back !== monthsBack) goMonth(monthsBack - back);
          }}
        />
      )}
      {/* Дії над видимим списком тихими текст-кнопками (redesign v3.1,
          Б5): іконки в боксах були єдиними такими в контенті. */}
      <div className="flex items-center gap-1">
        {selectMode ? (
          <>
            {selectedCount === 0 && (
              <span className="text-style-caption text-muted">
                Обери операції
              </span>
            )}
            <Button variant="outline" size="sm" onClick={exitSelectMode}>
              Скасувати
            </Button>
          </>
        ) : (
          <>
            {hiddenCount > 0 && (
              <Button variant="text" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? "Сховати прих." : `${hiddenCount} прих.`}
              </Button>
            )}
            {/* Експорт стоїть поруч із «прих.» і режимом вибору — у тому
                самому кластері дій над видимим списком. Ховається разом із
                ними в select-режимі: вивантажувати те, що людина зараз
                перебирає, означало б віддати файл із проміжного стану. */}
            {onExportCsv && exportCount > 0 && (
              <Button
                variant="text"
                onClick={onExportCsv}
                title={`Вивантажити ${exportCount} у CSV`}
                aria-label={`Вивантажити операції у CSV: ${exportCount}`}
              >
                CSV
              </Button>
            )}
            <Button variant="text" onClick={() => setSelectMode(true)}>
              Вибрати
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
