/**
 * Sergeant Design System — `InsightCard` (PR-7a).
 *
 * @lifecycle experimental (introduced 2026-05; promoted to active after PR-8)
 * @see docs/design/redesign-v2/governance.md § AI surfaces
 *
 * AI push card — конкретна пропозиція коли AI знайшов щось важливе.
 * Show-once-per-day, dismissible. Поступово рендериться через
 * `useInsightDismissal()` hook що зберігає dismissals у localStorage
 * (`sergeant.v2.insights.dismissed`).
 *
 * Структура:
 *   [✨ amber icon] [Title \n Subtitle (button → activate)] [→ (button → dismiss)]
 *
 * ## A11y refactor vs. handoff JSX
 *
 * Handoff JSX був nested-button: зовнішній `<div>` wrapping і activate
 * button + dismiss button — це OK, але це не group. Sergeant wraps в
 * `<div role="group" aria-labelledby="…">` так що screen readers
 * announce'ять обидві дії як повʼязані.
 *
 * ## Token discipline (Hard Rule #11 — no raw palette in className)
 *
 * Handoff пропонував `bg-em-900/95` (raw em-palette + opacity modifier).
 * У Sergeant це violation #11. Замість того використовуємо `bg-ink-strong`
 * — semantic token що мапиться на emerald-900 в light / white в dark /
 * pure #000 в HC (via PR-1). Контрастний text-bg-base inverts через
 * theme. Amber icon уживає `bg-celebration/20` (2026-08: коментар раніше
 * помилково називав неіснуючий `bg-celebration-soft` token).
 *
 * ## Module context
 *
 * `module` prop керує decorative module tint (через accent border) — але
 * primary visual identity лишається AI/celebration (amber + ink-strong),
 * не module accent. Це навмисно: insight reads as "from Sergeant", not
 * "from Finyk/Fizruk/...".
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
import { computeAdviceId } from "@sergeant/insights";
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
  /** Subtitle / recommended action ("Встановити ліміт?"). */
  subtitle: string;
  /** CTA glyph — defaults to → arrow. */
  ctaLabel?: string;
  /** Called when user taps the activate area. Navigate / open chat etc. */
  onActivate: () => void;
  /** Called after dismissal is persisted (analytics hook). */
  onDismiss?: () => void;
  /**
   * Чип «Спитати AI» — відкриває HubChat із префілом `Insight.askAiPrompt`.
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
  ctaLabel = "→",
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
  // localStorage НАЗАВЖДИ (попри docstring вище про show-once-per-day), тож
  // для вже відкинутої картки shown стріляти не має — інакше знаменник
  // рахував би покази, яких користувач не бачив.
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
        // v2 push-card chrome — ink-strong solid in light, glass-tinted
        // in dark (mirrors handoff `bg-em-900/95` intent without raw
        // palette). Shadow uses elevation `shadow-e3` (overlay tier).
        "mx-3.5 mt-2 px-3 py-2.5 rounded-3xl",
        "bg-ink-strong text-bg-base",
        "flex items-center gap-3 shadow-e3",
        className,
      )}
    >
      {/* Amber sparkle — celebration-tier visual signal so the card
          reads as "AI noticed something" without competing з module accent. */}
      <span
        aria-hidden
        className={cn(
          "w-8 h-8 rounded-xl shrink-0",
          "flex items-center justify-center",
          "bg-celebration/20 text-celebration",
        )}
      >
        <Icon name="sparkle" size={16} strokeWidth={2} />
      </span>

      {/* Activate button — title + subtitle. Takes the remaining width. */}
      <button
        type="button"
        onClick={handleActivate}
        className={cn(
          "flex-1 text-left min-w-0",
          "focus:outline-none focus-visible:rounded-xl",
          "focus-visible:ring-2 focus-visible:ring-celebration/45",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
      >
        <div
          id={titleId}
          className="text-style-label font-extrabold truncate text-bg-base"
        >
          {title}
        </div>
        <div className="text-style-caption opacity-70 truncate text-bg-base">
          {subtitle}
        </div>
      </button>

      {/* «Спитати AI» — окремий чип, праворуч перед dismiss (тап по тілу
          картки лишається навігацією в модуль, це третя незалежна дія).
          Рендериться лише коли call-site передав `onAskAi` — усі 9
          продуктових інсайтів це роблять. */}
      {onAskAi && (
        <button
          type="button"
          onClick={handleAskAi}
          disabled={askAiDisabled}
          aria-label={
            askAiDisabled ? "Ліміт AI на сьогодні" : "Спитати AI про це"
          }
          title={askAiDisabled ? "Ліміт AI на сьогодні" : undefined}
          className={cn(
            "shrink-0 touch-target inline-flex items-center gap-1 px-2.5 rounded-xl",
            "text-style-caption font-semibold",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-soft-fg/45",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            askAiDisabled
              ? "bg-white/10 text-bg-base/40 cursor-not-allowed"
              : "bg-brand-soft text-brand-soft-fg hover:brightness-105 active:scale-[0.98] transition-[filter,transform]",
          )}
        >
          <Icon name="sparkle" size={13} strokeWidth={2} aria-hidden />
          <span>Спитати AI</span>
        </button>
      )}

      {/* Dismiss button — separate sibling so Tab order is activate → dismiss. */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Закрити пропозицію"
        className={cn(
          "text-style-title text-celebration shrink-0 px-2 -my-1",
          "hover:opacity-80 transition-opacity",
          "focus:outline-none focus-visible:rounded-xl",
          "focus-visible:ring-2 focus-visible:ring-celebration/45",
        )}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
