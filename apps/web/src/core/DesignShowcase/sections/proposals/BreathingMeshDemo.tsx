import { useReducedMotion } from "@shared/hooks";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-V-7 — Живий mesh-фон, що дуже повільно «дихає».
 *
 * Зараз: MeshBackground статичний — фон нерухомий.
 * Може бути: субтильний idle-drift у межах motion-бюджету (scale 1 → 1.04,
 * зсув кількох px, цикл ~14s), повністю вимкнений за prefers-reduced-motion.
 */
export function BreathingMeshDemo() {
  const reduced = useReducedMotion();

  const mesh =
    "radial-gradient(40% 40% at 30% 30%, rgb(var(--c-accent-rgb)/0.35), transparent 70%), radial-gradient(45% 45% at 75% 65%, rgb(var(--c-accent-rgb)/0.22), transparent 70%)";

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              aria-hidden
              className="absolute -inset-8 opacity-70"
              style={{ background: mesh }}
            />
            <div className="relative flex h-full flex-col justify-end p-4">
              <p className="text-2xs uppercase tracking-wide text-muted">Hub</p>
              <p className="text-lg font-semibold text-text">Доброго ранку</p>
              <p className="text-2xs text-muted mt-1">Статичний фон</p>
            </div>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              aria-hidden
              className="absolute -inset-8 opacity-70"
              style={{
                background: mesh,
                animation: reduced
                  ? undefined
                  : "r2-breathe 14s ease-in-out infinite",
              }}
            />
            <div className="relative flex h-full flex-col justify-end p-4">
              <p className="text-2xs uppercase tracking-wide text-muted">Hub</p>
              <p className="text-lg font-semibold text-text">Доброго ранку</p>
              <p className="text-2xs text-muted mt-1">
                {reduced ? "Reduced motion — статично" : "Idle-дихання ~14s"}
              </p>
            </div>
          </div>
          <style>{`
            @keyframes r2-breathe {
              0%, 100% { transform: scale(1) translate(0, 0); }
              50% { transform: scale(1.04) translate(-6px, 4px); }
            }
          `}</style>
        </MiniPhone>
      }
    />
  );
}
