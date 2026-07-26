import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui";
import { useReducedMotion } from "@shared/hooks";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-V-1 — View Transitions API navigation.
 *
 * Before: navigating hub → module is a hard cut (the current custom
 * PageTransition aside). After: a shared crossfade/slide between routes so the
 * surface feels continuous. Emulated here with a CSS transition; the real
 * implementation would wrap navigation in document.startViewTransition().
 *
 * Mock only — tap "Відкрити модуль" / "Назад" to compare cut vs transition.
 */

export function ViewTransitionDemo() {
  const reduced = useReducedMotion();
  const [beforePage, setBeforePage] = useState<"hub" | "mod">("hub");
  const [afterPage, setAfterPage] = useState<"hub" | "mod">("hub");

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <Screen page={beforePage} />
          <NavBtn
            label={beforePage === "hub" ? "Відкрити модуль" : "Назад"}
            onClick={() => setBeforePage((p) => (p === "hub" ? "mod" : "hub"))}
          />
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              className={cn(
                "absolute inset-0",
                !reduced && "transition-all duration-500 ease-out",
              )}
              style={{
                transform: afterPage === "hub" ? "translateX(0)" : "translateX(-8%)",
                opacity: afterPage === "hub" ? 1 : 0,
              }}
            >
              <Screen page="hub" />
            </div>
            <div
              className={cn(
                "absolute inset-0",
                !reduced && "transition-all duration-500 ease-out",
              )}
              style={{
                transform: afterPage === "mod" ? "translateX(0)" : "translateX(8%)",
                opacity: afterPage === "mod" ? 1 : 0,
              }}
            >
              <Screen page="mod" />
            </div>
          </div>
          <NavBtn
            label={afterPage === "hub" ? "Відкрити модуль" : "Назад"}
            onClick={() => setAfterPage((p) => (p === "hub" ? "mod" : "hub"))}
          />
        </MiniPhone>
      }
    />
  );
}

function Screen({ page }: { page: "hub" | "mod" }) {
  const color = "rgb(var(--c-chart-finyk))";
  return (
    <div className="flex-1 min-h-0 px-3 pt-2">
      {page === "hub" ? (
        <>
          <p className="text-style-caption text-muted mb-2">Хаб</p>
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-panel border border-line" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
              <Icon name="credit-card" size={16} />
            </span>
            <span className="text-style-caption text-text">Фінік</span>
          </div>
          <div className="space-y-2">
            <div className="h-16 rounded-xl bg-panel border border-line" />
            <div className="h-12 rounded-xl bg-panel border border-line" />
          </div>
        </>
      )}
    </div>
  );
}

function NavBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="px-3 pb-2 pt-1">
      <button
        type="button"
        onClick={onClick}
        className="w-full h-9 rounded-xl bg-accent text-bg text-2xs font-medium"
      >
        {label}
      </button>
    </div>
  );
}
