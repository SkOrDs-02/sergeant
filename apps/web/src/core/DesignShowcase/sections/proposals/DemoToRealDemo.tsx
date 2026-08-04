import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon, Badge } from "@shared/components/ui";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UX-19 — Demo-to-real bridge.
 *
 * Before: sample/demo records are wiped when the user starts for real, so the
 * first screen empties out. After: each demo record carries a "зразок" badge
 * and a one-tap "Зробити своїм" that converts it into a real, editable entry —
 * turning the empty-state cliff into a gentle on-ramp.
 *
 * Mock only — tap "Зробити своїм" on a demo row to convert it.
 */

const SEED = [
  { id: 1, name: "Кава", amount: "₴ 65" },
  { id: 2, name: "Продукти", amount: "₴ 340" },
  { id: 3, name: "Таксі", amount: "₴ 120" },
];

export function DemoToRealDemo() {
  const [real, setReal] = useState<Set<number>>(new Set());

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center gap-2">
            <span className="h-10 w-10 rounded-full bg-surface-muted flex items-center justify-center text-muted">
              <Icon name="file-text" size={20} />
            </span>
            <p className="text-style-caption text-text">Поки що порожньо</p>
            <p className="text-style-caption text-muted">
              Демо-записи стерлись на старті.
            </p>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="flex-1 min-h-0 px-3 pt-2 space-y-1.5">
            <p className="text-style-caption text-muted mb-1">Витрати</p>
            {SEED.map((s) => {
              const isReal = real.has(s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border p-2.5 flex items-center gap-2",
                    isReal
                      ? "border-line bg-panel"
                      : "border-dashed border-accent/40 bg-accent/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-style-caption text-text">
                        {s.name}
                      </span>
                      {!isReal ? (
                        <Badge variant="warning" tone="soft" size="sm">
                          зразок
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-style-caption tabular-nums text-muted">
                      {s.amount}
                    </span>
                  </div>
                  {isReal ? (
                    <span className="text-accent">
                      <Icon name="check-circle" size={16} />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReal((p) => new Set(p).add(s.id))}
                      className="text-style-caption font-medium text-accent whitespace-nowrap"
                    >
                      Зробити своїм
                    </button>
                  )}
                </div>
              );
            })}
            <p className="text-style-caption text-muted pt-1">
              Зразок стає реальним записом, а не зникає.
            </p>
          </div>
        </MiniPhone>
      }
    />
  );
}
