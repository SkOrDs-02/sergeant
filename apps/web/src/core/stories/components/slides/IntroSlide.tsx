import { StoryShell } from "./StoryShell";
import type { Slide } from "../../types";

export function IntroSlide({ slide }: { slide: Slide }) {
  return (
    <StoryShell slide={slide}>
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-xs uppercase tracking-[0.3em] text-white/70 font-bold mb-3">
          Щотижневий дайджест
        </p>
        <h2 className="text-display-stat leading-[1.05] font-black mb-4">
          Твій тиждень
        </h2>
        <p className="text-base text-white/85 leading-relaxed max-w-88">
          Коротке зведення по всіх модулях. Тапай праворуч, щоб гортати далі,
          ліворуч — назад. Утримуй, щоб зупинити.
        </p>
      </div>
      <div className="text-style-label text-white/85">{slide.weekRange}</div>
    </StoryShell>
  );
}
