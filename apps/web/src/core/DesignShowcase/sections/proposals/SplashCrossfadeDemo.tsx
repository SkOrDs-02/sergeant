import { useState } from "react";
import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { ComparePair, MiniPhone } from "./_Compare";

function HubGrid() {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-accent" />
        <span className="text-style-body font-semibold text-fg">Sergeant</span>
      </div>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-panel" />
        ))}
      </div>
    </div>
  );
}

/**
 * R2-V-20 — Splash → app crossfade з брендовим логотипом.
 * Ліворуч: різкий cut (як зараз). Праворуч: splash плавно тане у Хаб, лого «переходить» у хедер.
 * Reduced-motion → миттєвий cut в обох.
 */
export function SplashCrossfadeDemo() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"splash" | "app">("splash");

  const replay = (crossfade: boolean) => {
    setPhase("splash");
    window.setTimeout(() => setPhase("app"), crossfade && !reduced ? 900 : 60);
  };

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="relative h-full">
            {phase === "app" ? (
              <HubGrid />
            ) : (
              <div className="flex h-full items-center justify-center bg-accent">
                <div className="h-14 w-14 rounded-2xl bg-onAccent/90" />
              </div>
            )}
            <button
              type="button"
              onClick={() => replay(false)}
              className="absolute inset-x-3 bottom-3 rounded-full bg-panel/90 px-4 py-2 text-style-caption font-medium text-fg"
            >
              Відтворити запуск
            </button>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="relative h-full">
            {/* App layer */}
            <div
              style={{
                opacity: phase === "app" ? 1 : 0,
                transform: phase === "app" ? "none" : "translateY(10px)",
                transition: reduced ? undefined : "opacity 500ms 150ms, transform 500ms 150ms",
                height: "100%",
              }}
            >
              <HubGrid />
            </div>
            {/* Splash layer */}
            <div
              className="absolute inset-0 flex items-center justify-center bg-accent"
              style={{
                opacity: phase === "splash" ? 1 : 0,
                pointerEvents: phase === "splash" ? "auto" : "none",
                transition: reduced ? "opacity 60ms" : "opacity 600ms ease",
              }}
            >
              <div
                className="h-14 w-14 rounded-2xl bg-onAccent/90"
                style={{
                  transform: phase === "splash" ? "scale(1)" : "scale(0.4) translate(-40%, -60%)",
                  transition: reduced ? undefined : "transform 700ms cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => replay(true)}
              className="absolute inset-x-3 bottom-3 rounded-full bg-panel/90 px-4 py-2 text-style-caption font-medium text-fg"
            >
              Відтворити запуск
            </button>
          </div>
        </MiniPhone>
      }
    />
  );
}
