import { useCallback, useEffect, useState } from "react";
import type { StatusColor } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Icon, ICON_NAMES } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  openHubModuleWithAction,
  type HubModuleAction,
  type HubModuleId,
} from "@shared/lib/modules/hubNav";
import { getModulePrimaryAction } from "@shared/lib/modules/moduleQuickActions";
import { generateRecommendations } from "../lib/recommendationEngine";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import {
  dismissalsOfToday,
  isDismissedToday,
} from "@shared/lib/insights/dismissedToday";
import { coreMessages } from "@shared/i18n/uk.core";

// Reuse the same dismissed-map key HubRecommendations used so the storage
// contract stays stable across the redesign. Значення — `ts` відкидання, і
// діє воно ДО КІНЦЯ ПОТОЧНОЇ ОСОБИСТОЇ ДОБИ (рішення власника 2026-10-01):
// старі записи без сьогоднішньої мітки прострочені. Експортується для
// `core/hub/now/useNowItems.ts`: об'єднаний список «Зараз» пише dismiss у
// ТЕ САМЕ сховище, а не заводить третє (спека `hub-action-axis.md`).
export const HUB_RECS_DISMISSED_KEY = "hub_recs_dismissed_v1";
const DISMISSED_KEY = HUB_RECS_DISMISSED_KEY;

const MODULE_ACCENT = {
  finyk: "bg-finyk",
  fizruk: "bg-fizruk",
  routine: "bg-routine",
  nutrition: "bg-nutrition",
  hub: "bg-primary",
};

// Subtle module-tinted background wash for the primary hero card. Uses the
// low-saturation "soft"/"surface" color tokens defined in tailwind.config;
// opacity is tuned so the card dominates without fighting dark mode.
const MODULE_WASH = {
  finyk: "bg-finyk-soft/60 dark:bg-finyk-soft/10",
  fizruk: "bg-fizruk-soft/60 dark:bg-fizruk-soft/10",
  routine: "bg-routine-surface/60 dark:bg-routine-surface/20",
  nutrition: "bg-nutrition-soft/60 dark:bg-nutrition-soft/10",
  hub: "bg-panelHi",
};

const SEVERITY_TONE = {
  danger: {
    accent: "bg-danger",
    wash: "bg-danger-soft/70 dark:bg-danger/10",
    border: "border-danger/30",
    eyebrow: "text-danger-strong dark:text-danger",
  },
  warning: {
    accent: "bg-warning",
    wash: "bg-warning-soft/70 dark:bg-warning/10",
    border: "border-warning/35",
    eyebrow: "text-warning-strong dark:text-warning",
  },
};

// Fallback for CTA коли rec не несе свого `pwaAction`: просто відкриває
// модуль. Імперативна дія (`add_expense`, `start_workout`, …) береться з
// `getModulePrimaryAction` і dispatchається через hubNav — центральний шлях
// квік-адду з дашборду.
const MODULE_OPEN_CTA = {
  finyk: "Відкрити Фінік",
  fizruk: "Відкрити Фізрук",
  routine: "Відкрити Рутину",
  nutrition: "Відкрити Їжу",
  hub: "Подивитись",
};

/**
 * Hook that exposes the current dashboard focus (= top recommendation) plus
 * the rest of the visible recommendations, sharing dismiss state with the
 * unified insights panel.
 */
export function useDashboardFocus() {
  const [dismissed, setDismissed] = useLocalStorageState<
    Record<string, number>
  >(DISMISSED_KEY, {});
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const recs = generateRecommendations();

  // Без `useMemo`: `recs` — новий масив на кожен рендер (мемо нічого не
  // економило), а предикат залежить від поточної доби, якої в залежностях
  // немає, — застосунок, відкритий через північ, мусить повернути вчорашні
  // відкидання на найближчому рендері (тік раз на дві хвилини).
  const visible = recs.filter((r) => !isDismissedToday(dismissed[r.id]));

  const dismiss = useCallback(
    (id: string) => {
      // Заодно викидаємо прострочені id, щоб мапа не росла.
      setDismissed((prev) => ({
        ...dismissalsOfToday(prev),
        [id]: Date.now(),
      }));
    },
    [setDismissed],
  );

  return {
    focus: visible[0] || null,
    rest: visible.slice(1),
    /**
     * Усі активні рекомендації, НЕ відфільтровані відкиданням. Потрібні тому,
     * хто питає «чи активна ця ситуація», а не «що показати»: купа «Закрито
     * сьогодні» не має казати «перевищень немає», бо картку про перевищення
     * сховали.
     */
    allRecs: recs,
    dismiss,
  };
}

interface FocusRec {
  id: string;
  module: keyof typeof MODULE_ACCENT;
  severity?: StatusColor | undefined;
  title: string;
  body?: string | undefined;
  icon?: string | undefined;
  action: string;
  pwaAction?: HubModuleAction | undefined;
}

/**
 * Primary hero on the dashboard: one next-best-action derived from the
 * recommendation engine. CTA виконує дію (PWA-intent) інлайн, а не
 * навігує в модуль — це ключова зміна action-driven дашборду.
 *
 * Renders nothing when there is no focus rec — the bento module grid
 * below already exposes per-module quick-add affordances, so a chip
 * fallback would duplicate them and split the user's attention
 * (ONE-HERO rule, mirrored in `HubDashboard`).
 */
export function TodayFocusCard({
  focus,
  onAction,
  onDismiss,
  onAskAi,
  askAiDisabled = false,
  primaryLabel,
  kicker = true,
}: {
  focus: FocusRec | null;
  onAction: (module: string) => void;
  onDismiss: (id: string) => void;
  /**
   * Чип «AI» — відкриває HubChat із префілом. З'являється лише під віссю
   * дії (`NowPile`), коли hero має `Insight`-джерело з `askAiPrompt`
   * (рішення власника: «дія з Rec + чип AI з Insight»). Стара головна
   * пропа не передає — і не бачить чипа.
   */
  onAskAi?: (() => void) | undefined;
  askAiDisabled?: boolean | undefined;
  /**
   * Підпис основної кнопки, коли дія НЕ імперативна (`pwaAction` немає): за
   * замовчуванням «Відкрити <модуль>». Потрібен картці, що веде не в модуль
   * (тижнева картка про темп → «Відкрити звіт тижня»).
   */
  primaryLabel?: string | undefined;
  /**
   * Кікер «Зараз» над заголовком. Під віссю дії його вже несе заголовок
   * купи (`NowPile`), і другий «Зараз» на тому ж екрані — дубль.
   */
  kicker?: boolean | undefined;
}) {
  if (!focus) {
    return null;
  }

  const severityTone =
    focus.severity === "danger" || focus.severity === "warning"
      ? SEVERITY_TONE[focus.severity]
      : null;
  const accent =
    severityTone?.accent || MODULE_ACCENT[focus.module] || "bg-primary";
  const wash = severityTone?.wash || MODULE_WASH[focus.module] || "bg-panelHi";

  // Базова лінія перед віссю дії хабу (P3): «CTA у TodayFocusCard» — третя
  // з трьох подій, без яких перехід на A1 не починається. `rec_id` — ключ
  // дедупу з `recommendationEngine`, не PII.
  const trackCta = (kind: "primary" | "secondary") =>
    trackEvent(ANALYTICS_EVENTS.TODAY_FOCUS_CTA_CLICKED, {
      rec_id: focus.id,
      module: focus.module,
      kind,
      has_pwa_action: Boolean(focus.pwaAction),
    });

  const primary = focus.pwaAction
    ? (() => {
        const quick = getModulePrimaryAction(focus.module);
        return {
          label: quick?.label || MODULE_OPEN_CTA[focus.module] || "Відкрити",
          run: () => {
            trackCta("primary");
            openHubModuleWithAction(
              focus.module as HubModuleId,
              focus.pwaAction as HubModuleAction,
              "today_focus_cta",
            );
          },
        };
      })()
    : {
        label: primaryLabel || MODULE_OPEN_CTA[focus.module] || "Відкрити",
        run: () => {
          trackCta("primary");
          onAction(focus.action);
        },
      };

  // Fallback: коли primary був імперативним, додаємо текстовий линк
  // «Відкрити X» як secondary — для юзерів, які хочуть спершу
  // перевірити контекст у модулі, не фіксуючи нічого.
  const secondary =
    focus.pwaAction && onAction
      ? {
          // Reuse the grammatically-correct accusative CTA ("Відкрити Їжу",
          // "Відкрити Рутину") instead of stitching "Відкрити " + a nominative
          // label ("Відкрити Їжа" read wrong for the renamed module).
          label: MODULE_OPEN_CTA[focus.module] || "Відкрити",
          run: () => {
            trackCta("secondary");
            onAction(focus.action);
          },
        }
      : null;

  return (
    <Card
      prominence="glass"
      radius="lg"
      padding="none"
      className={cn(
        "relative overflow-hidden p-4",
        "bg-hub-hero dark:bg-panel",
        wash,
        severityTone?.border,
      )}
    >
      {/* Accent bar */}
      <div
        className={cn(
          "absolute left-0 top-4 bottom-4 w-1 rounded-r-full",
          accent,
        )}
        aria-hidden
      />

      {/* Dismiss X — corner button, keeps CTA row uncluttered */}
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(focus.id)}
          aria-label="Закрити підказку"
          className={cn(
            "absolute top-2.5 right-2.5",
            "w-7 h-7 touch-target flex items-center justify-center rounded-xl",
            "text-muted hover:text-text hover:bg-black/5 dark:hover:bg-white/10",
            "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
          )}
        >
          <Icon name="close" size="sm" strokeWidth={2.5} />
        </button>
      )}

      <div className="pl-3 pr-6">
        {kicker && (
          <div className="flex items-center gap-3 mb-1">
            <SectionHeading
              as="span"
              size="xs"
              variant="muted"
              className={severityTone?.eyebrow}
            >
              Зараз
            </SectionHeading>
          </div>
        )}

        <h2 className="text-style-title font-bold text-text leading-snug text-balance">
          {/* `icon` рекомендації — імʼя гліфа з каталогу `Icon`. До
              2026-08-21 конвенція була подвійною: незареєстроване значення
              малювалось як ТЕКСТ, і саме через цю гілку сюди потрапляли
              емодзі фінансових правил (`📌`, `🎯`, `👏`). Правила
              переведено на імена, тож текстової гілки більше немає —
              незнайоме імʼя тепер нічого не малює, а не підсовує
              випадковий гліф системним шрифтом. */}
          {focus.icon && ICON_NAMES.includes(focus.icon) && (
            <Icon
              name={focus.icon}
              size="md"
              className="inline-block mr-1.5 align-middle text-muted"
              aria-hidden
            />
          )}
          {focus.title}
        </h2>

        {focus.body && (
          <p className="text-style-body text-muted mt-1 leading-relaxed">
            {focus.body}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={primary.run}
            aria-label={`${primary.label}: ${focus.title}`}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl touch-target focus-ring",
              "bg-primary text-bg text-style-label font-semibold",
              "hover:brightness-110 active:scale-[0.98] transition-[filter,opacity,transform]",
            )}
          >
            {primary.label}
            <Icon name="chevron-right" size="sm" strokeWidth={2.5} />
          </button>
          {onAskAi && (
            <button
              type="button"
              onClick={onAskAi}
              disabled={askAiDisabled}
              aria-label={
                askAiDisabled
                  ? coreMessages.hub.nowPile.askAiLimit
                  : coreMessages.hub.nowPile.askAi
              }
              className={cn(
                "touch-target inline-flex items-center gap-1 px-2.5 rounded-xl text-style-caption font-semibold focus-ring",
                askAiDisabled
                  ? "bg-panelHi text-muted cursor-not-allowed"
                  : "bg-brand-soft text-brand-soft-fg hover:brightness-105 active:scale-[0.98] transition-[filter,transform]",
              )}
            >
              {coreMessages.hub.nowPile.askAiChip}
            </button>
          )}
          {secondary && (
            <button
              type="button"
              onClick={secondary.run}
              className={cn(
                "text-style-caption text-muted hover:text-text",
                "px-2.5 py-2 rounded-xl touch-target focus-ring hover:bg-panelHi transition-colors",
              )}
            >
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
