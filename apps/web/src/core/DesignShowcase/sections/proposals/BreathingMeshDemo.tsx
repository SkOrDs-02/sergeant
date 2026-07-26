import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { PhoneFrame } from "./_PhoneFrame";

/**
 * R2-V-7 — Живий mesh-фон, що дуже повільно «дихає».
 * Наявний MeshBackground статичний. Тут — субтильний idle-drift у межах
 * motion-бюджету: вимикається за prefers-reduced-motion.
 */
export function BreathingMeshDemo() {
  const reduced = useReducedMotion();

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label={reduced ? "Reduced motion — статично" : "Idle-дихання ~14s"}>
        <div className="relative h-full overflow-hidden">
          <div
            aria-hidden
            className="absolute -inset-8 opacity-70"
            style={{
              background:
                "radial-gradient(40% 40% at 30% 30%, rgb(var(--c-accent-rgb)/0.35), transparent 70%), radial-gradient(45% 45% at 75% 65%, rgb(var(--c-accent-rgb)/0.22), transparent 70%)",
              animation: reduced ? undefined : "r2-breathe 14s ease-in-out infinite",
            }}
          />
          <div className="relative flex h-full flex-col justify-end p-4">
            <p className="text-2xs uppercase tracking-wide text-muted">Hub</p>
            <p className="text-lg font-semibold text-strong">Доброго ранку</p>
          </div>
        </div>
      </PhoneFrame>
      <p className="text-2xs leading-relaxed text-muted">
        Амплітуда навмисно мала (scale 1 → 1.04, зсув кількох px), щоб фон відчувався живим, але не відволікав.
      </p>
      <style>{`
        @keyframes r2-breathe {
          0%, 100% { transform: scale(1) translate(0, 0); }
          50% { transform: scale(1.04) translate(-6px, 4px); }
        }
      `}</style>
    </div>
  );
}
