import { useState } from "react";
import { useReducedMotion } from "@shared/hooks";
import { ComparePair, MiniPhone } from "./_Compare";

/** One vertical digit reel that slides to the target digit. */
function DigitReel({ digit, reduced }: { digit: number; reduced: boolean }) {
  return (
    <span className="relative inline-block h-[1.1em] w-[0.62em] overflow-hidden align-baseline tabular-nums">
      <span
        className="absolute left-0 top-0 flex flex-col"
        style={{
          transform: `translateY(-${digit * 10}%)`,
          transition: reduced ? undefined : "transform 700ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {Array.from({ length: 10 }).map((_, n) => (
          <span key={n} className="flex h-[1.1em] items-center justify-center leading-none">
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * R2-V-11 — Numeric roll-up (одометр) для великих тоталів.
 *
 * Зараз: тотал міняється миттєвою підміною тексту — стрибок без зчитуваного
 * руху.
 * Може бути: кожна цифра — окремий барабан, що прокручується до нового
 * значення (натяк на лічильник). За reduced-motion барабани стрибають миттєво.
 *
 * Тисни «Оновити» — ліва цифра стрибає, права котиться.
 */
export function OdometerRollupDemo() {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(1240);
  const digits = String(value).padStart(5, "0").split("").map(Number);

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <MiniPhone dim>
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-2xs uppercase tracking-wide text-muted">Баланс місяця</p>
              <div className="flex items-baseline text-4xl font-semibold text-text tabular-nums">
                <span className="mr-1 text-2xl text-muted">₴</span>
                {String(value).padStart(5, "0")}
              </div>
              <p className="text-2xs text-muted">Миттєва підміна</p>
            </div>
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <p className="text-2xs uppercase tracking-wide text-muted">Баланс місяця</p>
              <div className="flex items-baseline text-4xl font-semibold text-text">
                <span className="mr-1 text-2xl text-muted">₴</span>
                {digits.map((d, i) => (
                  <DigitReel key={i} digit={d} reduced={reduced} />
                ))}
              </div>
              <p className="text-2xs text-muted">Барабани котяться</p>
            </div>
          </MiniPhone>
        }
      />
      <button
        type="button"
        onClick={() => setValue(Math.floor(2000 + Math.random() * 40000))}
        className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-bg"
      >
        Оновити суму
      </button>
    </div>
  );
}
