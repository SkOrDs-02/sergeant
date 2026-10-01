/**
 * Last validated: 2026-09-01
 * Status: Active
 * Owner: @klas149
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
 * - **Оцінка остаточна: одна подія на пораду.** Після вибору лишається
 *   тільки обрана іконка (натиснута) і «Дякую», друга кнопка зникає — зміну
 *   думки не пропонуємо (рішення власника 2026-10-01). Так 👍 і 👎 від однієї
 *   людини не накладаються в статистиці, і UI не обіцяє того, що вже
 *   зараховане. Обрана кнопка лишається тим самим DOM-вузлом, тож фокус
 *   клавіатури не губиться; клік по ній — no-op.
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
 * Пара кнопок оцінки; після вибору лишається лише обрана іконка + «Дякую».
 * Нічого не рендерить без `adviceId`: подія-сирота роздула б чисельник без
 * відповідного знаменника `ai_advice_shown`.
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
    // Оцінка остаточна: друга подія на ту саму пораду не емітиться.
    if (verdict) return;
    setAnswered({ id: adviceId, verdict: next });
    trackAdviceReaction(adviceId, next);
  };

  const buttonClass = (own: AdviceVerdict) =>
    cn(
      // На coarse-pointer `touch-target` розтягує кнопку до 44×44; без
      // inline-flex-центрування SVG лишається в лівому верхньому куті.
      "inline-flex items-center justify-center",
      "p-1.5 rounded-xl touch-target transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
      verdict === own
        ? "text-brand bg-brand-soft cursor-default"
        : "text-muted hover:text-text hover:bg-panelHi",
    );

  // Після оцінки лишається лише обрана іконка: умовний рендер за позицією
  // зберігає DOM-вузол кнопки, тож фокус не зникає разом із прихованою.
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {verdict !== "not_helpful" && (
        <button
          type="button"
          onClick={choose("helpful")}
          aria-label={messages.adviceFeedback.helpful}
          aria-pressed={verdict === "helpful"}
          aria-disabled={verdict === "helpful" || undefined}
          className={buttonClass("helpful")}
        >
          <Icon name="thumbs-up" size="sm" />
        </button>
      )}
      {verdict !== "helpful" && (
        <button
          type="button"
          onClick={choose("not_helpful")}
          aria-label={messages.adviceFeedback.notHelpful}
          aria-pressed={verdict === "not_helpful"}
          aria-disabled={verdict === "not_helpful" || undefined}
          className={buttonClass("not_helpful")}
        >
          <Icon name="thumbs-down" size="sm" />
        </button>
      )}
      {verdict && (
        <span className="text-style-caption text-muted ml-0.5">
          {messages.adviceFeedback.thanks}
        </span>
      )}
    </div>
  );
}
