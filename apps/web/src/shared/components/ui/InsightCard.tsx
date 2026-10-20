/**
 * Sergeant Design System — `InsightCard` (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/design/redesign-v2/governance.md § AI surfaces
 *
 * AI push card — конкретна пропозиція коли AI знайшов щось важливе.
 * Show-once-per-day, dismissible. Поступово рендериться через
 * `useInsightDismissal()` hook що зберігає dismissals у localStorage
 * (`sergeant.v2.insights.dismissed`).
 *
 * v3.1 (інвентар Е3): гліф Сержанта без рамки-боксу; підзаголовок-дія
 * (`subtitleIsAction`) чорнилом тихого рівня, факт другим сірим.
 *
 * Структура (мова H, redesign v3 PR4):
 *   [Title 
 Subtitle (button → activate)] [Сержант (icon-button)] [× (dismiss)]
 *
 * Нейтральна панель `bg-panel` без тіні, без бурштинового гліфа в
 * тонованому квадраті й без темної плитки `ink-strong`: «від Сержанта»
 * несе кнопка-іконка дії, а не забарвлення картки. Обидві теми беруть ті
 * самі токени (панель, чорнило, другий сірий), тож окремої темної гілки
 * немає.
 *
 * Розмітка: `<div role="group" aria-labelledby="…">` обгортає три
 * незалежні кнопки, тож скрінрідер оголошує їх як повʼязані.
 *
 * ## Телеметрія петель цінності (Хвиля 2)
 *
 * Цей компонент — ЄДИНИЙ писар подій `value_signal_*` для всіх 9
 * продуктових сигналів у 4 модулях. НЕ додавай `trackEvent` у
 * `use*Insight.ts`-хуки: вони віддають дані, які все одно рендеряться
 * через `InsightCard`, тож подія полетить двічі й конверсія петлі
 * помножиться на два на рівному місці.
 */

import { useEffect, useState } from "react";
import { computeAdviceId } from "@sergeant/insights/adviceId";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { useInsightDismissal } from "@shared/lib/insights/useInsightDismissal";
import { parseInsightId } from "@shared/lib/insights/insightId";
import type { InsightId } from "@shared/lib/insights/types";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../core/observability/analytics";
import { getAnalyticsConsent } from "../../../core/observability/analyticsConsent";
import { markSignalShown } from "../../../core/observability/valueSignalAttribution";
import { trackAdviceReaction } from "../../../core/observability/adviceTelemetry";

/** Де саме рендериться картка — property `surface` контракту `value_signal_*`. */
export type InsightSurface = "module" | "hub";

/**
 * Once-guard показу: id, для яких `value_signal_shown` уже полетів у цьому
 * завантаженні сторінки.
 *
 * Навіщо. `FinykInsightsBlock` (і решта блоків) перераховують candidates на
 * кожен рендер батька, тож `InsightCard` монтується/розмонтовується десятки
 * разів за сесію. Без guard-а знаменник петлі («скільки разів сигнал
 * показано») роздувся б у десятки разів, а конверсія впала б у стільки ж.
 * Guard також гасить подвійний mount під React StrictMode.
 *
 * Ключ — САМЕ id, без `surface`. 8 із 9 сигналів мають `showOn: "both"`,
 * тобто той самий сигнал рендериться і на хабі, і в модулі. Один показ на
 * сигнал на сесію — це те, що потрібно метриці; `surface` фіксує, де його
 * побачили ВПЕРШЕ.
 *
 * Scope — page-load, не акаунт і не localStorage: аудит finyk B3 уже
 * зафіксував, що persistent-прапорці в localStorage дають хибну поведінку
 * після очищення браузера, а PostHog дедуплікує за `distinct_id` сам.
 */
const shownOnce = new Set<InsightId>();

/** Скидання once-guard-а між тестами. Не для продакшн-шляхів. */
export function __resetInsightShownGuard(): void {
  shownOnce.clear();
}

export interface InsightCardProps {
  /** Stable id for dismissal tracking (e.g. "finyk-coffee-limit-2026-05"). */
  id: InsightId;
  /** Bold signal headline ("Витрати на каву ↑ 34%"). */
  title: string;
  /** Subtitle / recommended action ("Встановити ліміт"). */
  subtitle: string;
  /** Підзаголовок - дія (а не факт): тоді чорнилом жирним. */
  subtitleIsAction?: boolean | undefined;
  /** CTA glyph — defaults to → arrow. */
  ctaLabel?: string;
  /** Called when user taps the activate area. Navigate / open chat etc. */
  onActivate: () => void;
  /** Called after dismissal is persisted (analytics hook). */
  onDismiss?: () => void;
  /**
   * Чип «Спитати Сержанта» — відкриває HubChat із префілом `Insight.askAiPrompt`.
   * Рендериться лише коли переданий (усі 9 продуктових інсайтів мають
   * `askAiPrompt`, тож call-site завжди його передає).
   */
  onAskAi?: () => void;
  /** Квота AI на сьогодні вичерпана (Free) — чип сірий, клік не працює. */
  askAiDisabled?: boolean;
  /**
   * Де рендериться картка. Їде у property `surface` подій `value_signal_*`.
   * Дефолт `"module"` — усі чотири модульні блоки рендерять картку без
   * пропа; хаб (`HubInsightsBlock`) передає `"hub"` явно.
   */
  surface?: InsightSurface;
  className?: string;
}

export function InsightCard({
  id,
  title,
  subtitle,
  subtitleIsAction = false,
  ctaLabel,
  onActivate,
  onDismiss,
  onAskAi,
  askAiDisabled = false,
  surface = "module",
  className,
}: InsightCardProps) {
  const { isDismissed, dismiss } = useInsightDismissal();
  // Local optimistic flag so the card disappears immediately on dismiss
  // even before the hook's localStorage write completes.
  const [hidden, setHidden] = useState(false);

  const isHidden = hidden || isDismissed(id);
  const { module, kind } = parseInsightId(id);

  // Подія показу. Стоїть ПЕРЕД раннім `return null` (Rules of Hooks), тому
  // умову «картку реально видно» перевіряємо всередині ефекту.
  //
  // ПАСТКА, яку тут закрито: `useInsightDismissal` тримає dismissed-id у
  // localStorage до кінця поточної доби (рішення 2026-10-01; раніше —
  // назавжди), тож для вже відкинутої картки shown стріляти не має —
  // інакше знаменник рахував би покази, яких користувач не бачив.
  useEffect(() => {
    if (isHidden) return;
    if (shownOnce.has(id)) return;
    shownOnce.add(id);
    markSignalShown({ signal: kind, module });
    trackEvent(ANALYTICS_EVENTS.VALUE_SIGNAL_SHOWN, {
      module,
      signal: kind,
      surface,
    });
    // Стабільний крос-девайсний advice_id (беta-хардненінг, рішення
    // founder-а) — доповнює VALUE_SIGNAL_SHOWN вище, а не замінює. `id` тут
    // уже детерміноване й cross-device-стабільне (генерується з domain-
    // контенту, напр. category id), тож `computeAdviceId(kind, id)` дає
    // ОДИН і той самий advice_id на будь-якому пристрої того самого
    // акаунта — на відміну від `ai_advice_shown`, чий `advice_id`
    // навмисно лишається випадковим uuid (окреме рішення, не тут).
    // Той самий `shownOnce`-guard, ключований по `id`, коректно дедуплікує
    // й `advice_id`, бо мапа `id → advice_id` детермінована.
    if (getAnalyticsConsent()) {
      trackEvent(ANALYTICS_EVENTS.ADVICE_SHOWN, {
        advice_id: computeAdviceId(kind, id),
        advice_type: kind,
        module,
      });
    }
  }, [id, kind, module, surface, isHidden]);

  if (isHidden) return null;

  // Обидві події емітяться ДО консюмерських колбеків (`onActivate` часто
  // навігує, `onDismiss` — довільний код власника). `trackEvent` сам по собі
  // fire-and-forget і ніколи не кидає, тож порядок нічим не ризикує, зате
  // throw усередині колбека не зʼїдає подію.
  const handleDismiss = () => {
    hapticTap();
    trackEvent(ANALYTICS_EVENTS.VALUE_SIGNAL_DISMISSED, {
      module,
      signal: kind,
      surface,
    });
    if (getAnalyticsConsent()) {
      trackEvent(ANALYTICS_EVENTS.ADVICE_DISMISSED, {
        advice_id: computeAdviceId(kind, id),
        advice_type: kind,
        module,
      });
    }
    dismiss(id);
    setHidden(true);
    onDismiss?.();
  };

  const handleActivate = () => {
    hapticTap();
    trackEvent(ANALYTICS_EVENTS.VALUE_SIGNAL_ACTIVATED, {
      module,
      signal: kind,
      surface,
    });
    onActivate();
  };

  const handleAskAi = () => {
    hapticTap();
    trackEvent(ANALYTICS_EVENTS.VALUE_SIGNAL_ASK_AI, {
      module,
      signal: kind,
      surface,
    });
    if (getAnalyticsConsent()) {
      trackAdviceReaction(computeAdviceId(kind, id), "ask_ai");
    }
    onAskAi?.();
  };

  const titleId = `insight-card-title-${id}`;

  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className={cn(
        // Мова H (redesign v3): нейтральна панель без тіні й без гліфа
        // в тонованому квадраті; «від Сержанта» несе кнопка-іконка дії.
        "flex items-center gap-2 rounded-panel bg-panel py-2 pl-4 pr-2",
        className,
      )}
    >
      {/* Activate button — title + subtitle. Takes the remaining width. */}
      <button
        type="button"
        onClick={handleActivate}
        className="flex-1 min-w-0 rounded-lg py-1 text-left focus-ring"
      >
        <div
          id={titleId}
          className="text-style-body font-semibold truncate text-text"
        >
          {title}
        </div>
        {/* Підзаголовок-дія чорнилом і жирним, як тиха кнопка v3.1
            (інвентар Е3); факт із числами лишається другим сірим, інакше дані
            читаються як кнопка. */}
        <div
          className={cn(
            "text-style-label truncate",
            subtitleIsAction ? "font-semibold text-text" : "text-muted",
          )}
        >
          {subtitle}
        </div>
      </button>

      {/* Чип «Спитати Сержанта» — окремий, праворуч перед dismiss (тап по
          тілу картки лишається навігацією в модуль, це третя незалежна дія).
          Рендериться лише коли call-site передав `onAskAi` — усі 9
          продуктових інсайтів це роблять.

          Чип лише з гліфом, без підпису: на 375px будь-який текст з'їдав
          ширину картки і рубав заголовок із підзаголовком у трикрапку
          (браузерна перевірка 2026-08-31). До 2026-09-01 тут стояло слово
          «AI» поруч з іскрою; рішення власника Q1 (анти-слоп аудит) замінило
          іскру на шеврон Сержанта і зняло слово — гліф уже несе значення.
          Повне формулювання лишається в `aria-label` — для скрінрідера
          нічого не змінилось. */}
      {onAskAi && (
        <button
          type="button"
          onClick={handleAskAi}
          disabled={askAiDisabled}
          aria-label={
            askAiDisabled
              ? "Ліміт запитів до Сержанта на сьогодні"
              : "Спитати Сержанта про це"
          }
          title={
            askAiDisabled ? "Ліміт запитів до Сержанта на сьогодні" : undefined
          }
          className={cn(
            "shrink-0 touch-target inline-flex h-9 w-9 items-center justify-center rounded-lg focus-ring",
            askAiDisabled
              ? "text-subtle cursor-not-allowed"
              : "text-text hover:bg-panelHi",
          )}
        >
          <Icon name="sergeant" size="sm" strokeWidth={2} aria-hidden />
        </button>
      )}

      {/* Dismiss button — separate sibling so Tab order is activate → dismiss. */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрити пропозицію"
        className="touch-target inline-flex shrink-0 items-center justify-center rounded-lg text-style-label text-muted hover:text-text focus-ring"
      >
        {/* SLOP-1 (аудит 2026-09): без явної мітки тут стояв текстовий гліф
            «→» — «гліф у слоті іконки» з анти-слоп стратегії §3.2. Тепер
            дефолт — справжня іконка; рядок лишається для кастомних міток. */}
        {ctaLabel ?? <Icon name="close" size="md" aria-hidden />}
      </button>
    </div>
  );
}
