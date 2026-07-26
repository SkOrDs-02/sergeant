import { useState } from "react";
import { useReducedMotion } from "../../../../shared/hooks/useReducedMotion";
import { PhoneFrame } from "./_PhoneFrame";

/**
 * R2-V-20 — Splash → app crossfade з брендовим логотипом.
 * Наявний BrandLogo є, але cold-start різкий. Тут splash плавно тане у Хаб,
 * а лого «переходить» у хедер. Reduced-motion → миттєвий cut.
 */
export function SplashCrossfadeDemo() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"splash" | "app">("splash");

  const replay = () => {
    setPhase("splash");
    window.setTimeout(() => setPhase("app"), reduced ? 60 : 900);
  };

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label={phase === "splash" ? "Splash" : "Хаб"}>
        <div className="relative h-full">
          {/* App layer */}
          <div className="flex h-full flex-col p-4">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-accent" style={{ opacity: phase === "app" ? 1 : 0, transition: "opacity 400ms" }} />
              <span className="text-sm font-semibold text-strong" style={{ opacity: phase === "app" ? 1 : 0, transition: "opacity 500ms 150ms" }}>
                Sergeant
              </span>
            </div>
            <div className="mt-4 grid flex-1 grid-cols-2 gap-3" style={{ opacity: phase === "app" ? 1 : 0, transform: phase === "app" ? "none" : "translateY(10px)", transition: "opacity 500ms 150ms, transform 500ms 150ms" }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-elevated" />
              ))}
            </div>
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
              className="h-14 w-14 rounded-2xl bg-on-accent/90"
              style={{
                transform: phase === "splash" ? "scale(1)" : "scale(0.4) translate(-40%, -60%)",
                transition: reduced ? undefined : "transform 700ms cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          </div>
        </div>
      </PhoneFrame>

      <button
        type="button"
        onClick={replay}
        className="rounded-full bg-elevated px-4 py-2 text-xs font-medium text-strong"
      >
        Відтворити запуск
      </button>
    </div>
  );
}
