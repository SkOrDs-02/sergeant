import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ComparePair, MiniPhone } from "./_Compare";

const STEPS = [
  { label: "S", scale: 0.9 },
  { label: "M", scale: 1 },
  { label: "L", scale: 1.15 },
  { label: "XL", scale: 1.3 },
] as const;

/**
 * R2-V-6 — Dynamic Type / масштаб шрифту.
 *
 * Зараз: розміри тексту фіксовані — за великого системного масштабу підписи
 * обрізаються, а кнопка тисне контент.
 * Може бути: інтерфейс переливається під користувацький масштаб, зберігаючи
 * вертикальний ритм і tap-safe кнопки.
 *
 * Обери масштаб нижче — ліва панель його ігнорує, права підлаштовується.
 */
export function DynamicTypeDemo() {
  const [step, setStep] = useState(2);
  const scale = (STEPS[step] ?? STEPS[1]).scale;

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <MiniPhone dim>
            {/* Fixed sizes: ignore the requested scale; clip at large steps. */}
            <div className="flex flex-1 min-h-0 flex-col gap-3 p-4 overflow-hidden">
              <p className="text-style-caption text-muted">Сьогодні</p>
              <div className="rounded-2xl bg-panel border border-line p-4">
                <p className="text-style-caption text-muted">Витрачено</p>
                <p className="text-2xl font-semibold text-text leading-tight">
                  ₴ 1 240
                </p>
              </div>
              {/* Simulate overflow when a large scale is requested. */}
              <div className="rounded-xl bg-panel border border-line px-3 py-2 whitespace-nowrap overflow-hidden">
                <span
                  className="text-style-body text-text"
                  style={{ fontSize: `${16 * scale}px` }}
                >
                  Категорія · Продукти
                </span>
              </div>
              <button
                type="button"
                className="mt-auto rounded-xl bg-accent px-4 py-3 text-style-caption font-medium text-bg"
              >
                Додати витрату
              </button>
              <p className="text-style-caption text-muted">
                Фіксований 16px, за XL текст обрізається.
              </p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div
              className="flex flex-1 min-h-0 flex-col gap-3 p-4"
              style={{ fontSize: `calc(1rem * ${scale})` }}
            >
              <p className="text-muted" style={{ fontSize: "0.75em" }}>
                Сьогодні
              </p>
              <div className="rounded-2xl bg-panel border border-line p-4">
                <p className="text-muted" style={{ fontSize: "0.75em" }}>
                  Витрачено
                </p>
                <p
                  className="font-semibold text-text"
                  style={{ fontSize: "1.6em", lineHeight: 1.2 }}
                >
                  ₴ 1 240
                </p>
              </div>
              <div className="rounded-xl bg-panel border border-line px-3 py-2">
                <span className="text-text" style={{ fontSize: "0.95em" }}>
                  Категорія · Продукти
                </span>
              </div>
              <button
                type="button"
                className="mt-auto rounded-xl bg-accent font-medium text-bg"
                style={{
                  paddingBlock: "max(0.6em, 12px)",
                  paddingInline: "1rem",
                  fontSize: "0.95em",
                }}
              >
                Додати витрату
              </button>
              <p className="text-muted" style={{ fontSize: "0.7em" }}>
                Ритм і цілі зберігаються за будь-якого масштабу.
              </p>
            </div>
          </MiniPhone>
        }
      />
      <div className="flex items-center justify-center gap-1 rounded-full bg-surface-muted p-1">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={cn(
              "h-8 w-12 rounded-full text-xs font-medium transition-colors",
              i === step ? "bg-accent text-bg" : "text-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
