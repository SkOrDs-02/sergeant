import { useState } from "react";
import { PhoneFrame } from "./_PhoneFrame";

const STEPS = [
  { label: "S", scale: 0.9 },
  { label: "M", scale: 1 },
  { label: "L", scale: 1.15 },
  { label: "XL", scale: 1.3 },
];

/**
 * R2-V-6 — Dynamic Type / масштаб шрифту.
 * Демонструє, як інтерфейс переливається під користувацький масштаб тексту,
 * зберігаючи вертикальний ритм (немає обрізань, кнопки лишаються tap-safe).
 */
export function DynamicTypeDemo() {
  const [step, setStep] = useState(1);
  const scale = (STEPS[step] ?? STEPS[1]!).scale;

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label="Масштаб тексту">
        <div className="flex h-full flex-col gap-3 p-4" style={{ fontSize: `calc(1rem * ${scale})` }}>
          <p className="text-muted" style={{ fontSize: "0.75em" }}>
            Сьогодні
          </p>
          <div className="rounded-2xl bg-elevated p-4">
            <p className="text-muted" style={{ fontSize: "0.75em" }}>
              Витрачено
            </p>
            <p className="font-semibold text-strong" style={{ fontSize: "1.6em", lineHeight: 1.2 }}>
              ₴ 1 240
            </p>
          </div>
          <button
            type="button"
            className="mt-auto rounded-xl bg-accent px-4 font-medium text-on-accent"
            style={{ paddingBlock: "max(0.6em, 12px)", fontSize: "0.95em" }}
          >
            Додати витрату
          </button>
        </div>
      </PhoneFrame>

      <div className="flex items-center justify-center gap-1 rounded-full bg-elevated p-1">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={`h-8 flex-1 rounded-full text-xs font-medium transition-colors ${
              i === step ? "bg-accent text-on-accent" : "text-muted"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
