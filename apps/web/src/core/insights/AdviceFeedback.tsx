/**
 * Last validated: 2026-09-01
 * Status: Active
 * Owner: @Skords-01
 *
 * Оцінка AI-поради — «корисно / ні». Спільна для `AssistantAdviceCard`
 * (коуч) і `WeeklyDigestCard` (тижневий дайджест).
 *
 * ## Навіщо це існує
 *
 * Це єдина поверхня в продукті, яка питає про ЯКІСТЬ поради. Решта
 * реакцій (`ask_ai`, `refresh`, `collapse`) кажуть, що людина зробила, і
 * жодна не каже, чи порада була варта показу. Поки цього немає, корисний
 * інсайт і правдоподібний шум дають однакову статистику, а kill-критерій
 * AI-шару (`product-overview.md` §10) лишається нефальсифікованим.
 *
 * Урок ринку тут прямий: Apple згорнула Project Mulberry (02/2026) —
 * перфекціонізм без релізу програв ітераціям зі зворотним звʼязком, а Oura
 * виграла довіру саме eval-ами. Без 👍/👎 ми не відрізняємо себе від Whoop,
 * чий коуч вигадує дані і дізнається про це з Reddit.
 *
 * ## Межі, які тут свідомі
 *
 * - **Причина «чому погано» не питається.** Вільний текст скарги — це
 *   знову дані користувача про його гроші й тіло, і він не має куди
 *   поїхати без порушення Hard Rule #21. Бінарна оцінка без тексту менш
 *   інформативна, але вона чесна; текстовий фідбек — окреме рішення з
 *   власним каналом зберігання, не побічний ефект цієї кнопки.
 * - **Вибір живе в межах завантаження сторінки.** Той самий прецедент, що
 *   `shownOnce` в `adviceTelemetry`: persistent-прапорці в localStorage
 *   дають хибну поведінку після очищення браузера, а PostHog і так
 *   дедуплікує за `distinct_id`. Практично: перезавантажив — можеш
 *   оцінити ту саму пораду ще раз, і це прийнятний шум.
 * - **Подія одна на натиснуту кнопку.** Повторний клік по вже обраній
 *   оцінці — no-op; зміна думки (👍 після 👎) емітить другу подію
 *   навмисно, бо це окремий факт, а не виправлення одруку.
 */

import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { trackAdviceReaction } from "../observability/adviceTelemetry";

export type AdviceVerdict = "helpful" | "not_helpful";

export interface AdviceFeedbackProps {
  /** `advice_id` поради. Без нього оцінку нікуди атрибутувати. */
  adviceId: string | null | undefined;
  className?: string;
}

/**
 * Пара кнопок оцінки. Нічого не рендерить без `adviceId`: подія-сирота
 * роздула б чисельник без відповідного знаменника `ai_advice_shown`.
 */
export function AdviceFeedback({ adviceId, className }: AdviceFeedbackProps) {
  // Оцінка зберігається РАЗОМ з id поради, до якої вона належить, і
  // виводиться порівнянням під час рендеру. Скидання ефектом було б
  // зайвим проходом рендеру (`react-hooks/set-state-in-effect`), а без
  // скидання взагалі оцінка попередньої поради лишалась би підсвіченою на
  // наступній — UI брехав би, що людина вже відповіла.
  const [answered, setAnswered] = useState<{
    id: string;
    verdict: AdviceVerdict;
  } | null>(null);
  const verdict =
    answered && answered.id === adviceId ? answered.verdict : null;

  if (!adviceId) return null;

  const choose = (next: AdviceVerdict) => (e: React.MouseEvent) => {
    // Картка-контейнер клікабельна (розгортання) — оцінка не має її чіпати.
    e.stopPropagation();
    if (verdict === next) return;
    setAnswered({ id: adviceId, verdict: next });
    trackAdviceReaction(adviceId, next);
  };

  const buttonClass = (own: AdviceVerdict) =>
    cn(
      "p-1.5 rounded-xl touch-target transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
      verdict === own
        ? "text-brand bg-brand-soft"
        : "text-muted hover:text-text hover:bg-panelHi",
    );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={choose("helpful")}
        aria-label={messages.adviceFeedback.helpful}
        aria-pressed={verdict === "helpful"}
        className={buttonClass("helpful")}
      >
        <Icon name="thumbs-up" size={14} />
      </button>
      <button
        type="button"
        onClick={choose("not_helpful")}
        aria-label={messages.adviceFeedback.notHelpful}
        aria-pressed={verdict === "not_helpful"}
        className={buttonClass("not_helpful")}
      >
        <Icon name="thumbs-down" size={14} />
      </button>
      {verdict && (
        <span className="text-style-caption text-muted ml-0.5">
          {messages.adviceFeedback.thanks}
        </span>
      )}
    </div>
  );
}
