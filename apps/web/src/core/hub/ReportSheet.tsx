/**
 * Last validated: 2026-08-07
 * Status: Active
 *
 * Оболонка звітної картки хабу — власний матеріал «край і зріз» (П3,
 * `docs/05-design/design/anti-slop-strategy.md`).
 *
 * AI-CONTEXT: чому `stub`, а не пара `rule`/`perf` як у стосі транзакцій.
 * Стос вимагає СУМІЖНОСТІ: у списку транзакцій день і його рядки стоять
 * впритул, тож лінійка зверху й перфорація знизу обіймають один документ.
 * Тут між картками `gap-3`, і вони живуть під спільним перемикачем
 * періоду — але кожна лишається окремим звітом свого модуля. Дати їм
 * `rule`/`perf` означало б стверджувати неперервність, якої на екрані
 * немає: середні картки лишились би скругленими, а квадратними стали б
 * лише крайні. Тому кожна — самодостатній аркуш, рівно як `WeeklyDigestCard`
 * прямо над ними у цьому ж перегляді.
 *
 * AI-DANGER: падінг НЕ можна ставити на вузол із `edge-stub`. Утиліта сама
 * задає `padding-bottom` під зубці перфорації, а будь-який `p-*` у тому ж
 * `className` перекриє її — і маска почне вигризати текст. Тому падінг
 * живе на внутрішньому вузлі; та сама будова, що в `WeeklyDigestCard` і
 * `DayCardShell`.
 *
 * Підйом (`edge-lift-interactive`) стоїть на БАТЬКОВІ: маска зрізає будь-яку
 * тінь на своєму вузлі — і `box-shadow`, і `filter`. Це заміряно, не
 * виведено; деталі в `Card.tsx` § MASKED_EDGES.
 *
 * Клас `.report-card` тут навмисно НЕ використовується. Він давав глибину
 * світлом (dark-режимний inset-glow плюс accent-glow на розгортанні), а цей
 * матеріал тримає верхню межу фарбою — 2px друкарською лінійкою. Гірше того,
 * `.dark .report-card` специфічніший за утиліту, тож його `box-shadow`
 * переміг би `box-shadow: none` у `edge-stub` — і маска зрізала б тінь
 * МОВЧКИ, лишивши поверхню пласкою рівно там, де ми хотіли глибини.
 */
import type { ReactNode } from "react";

export interface ReportSheetProps {
  /** Згорнутий стан картки — впливає лише на щільність падінга. */
  collapsed: boolean;
  children: ReactNode;
}

export function ReportSheet({ collapsed, children }: ReportSheetProps) {
  return (
    <div className="edge-lift-interactive">
      <div className="edge-stub bg-panel border border-line">
        <div className={collapsed ? "p-3" : "p-4 space-y-3"}>{children}</div>
      </div>
    </div>
  );
}
