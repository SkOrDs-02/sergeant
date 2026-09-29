/**
 * Купа «Зараз» — перша з двох куп осі дії (A1, спека `hub-action-axis.md`).
 *
 * Джерело — `useNowItems` (обидва ранкери в одному списку). Cap за рішенням
 * власника 2026-09-17: **3 розгорнуто + «ще N»**. Перший рядок — hero з
 * інлайн-дією (той самий `TodayFocusCard`, що й раніше), ще два — рядками,
 * хвіст згорнутий і сам ніколи не розгортається; рядок із
 * `severity: "danger"` завжди пробивається в трійку. Число 3 — `DEFAULT_CAP`
 * з `useAllInsights`, винесений на екран, не нова константа.
 *
 * Порожня купа — один рядок «Сьогодні все закрито», без CTA: у тихий день
 * винагорода живе в купі «Закрито сьогодні» нижче, не тут.
 *
 * Last validated: 2026-09-17
 * Status: Active
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon, ICON_NAMES } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import {
  openHubModuleWithAction,
  isHubModuleId,
  type HubModuleAction,
} from "@shared/lib/modules/hubNav";
import { useAskAiQuotaExhausted } from "@shared/lib/insights/useAskAiQuota";
import { coreMessages } from "@shared/i18n/uk.core";
import { TodayFocusCard } from "../../insights/TodayFocusCard";
import { useNowItems } from "./useNowItems";
import type { NowItem } from "./nowItems";

/** Скільки рядків видно без «ще N». */
export const NOW_PILE_VISIBLE = 3;

/**
 * Перші `cap` рядків, але `danger` не лишається у хвості: стабільний
 * розділ на дві групи зберігає порядок пріоритетів усередині кожної.
 */
export function promoteDanger(
  items: readonly NowItem[],
  cap: number,
): NowItem[] {
  const danger = items.filter((i) => i.severity === "danger");
  const rest = items.filter((i) => i.severity !== "danger");
  return [...danger, ...rest].slice(0, cap);
}

/**
 * Куди веде рядок. `open_module` іде через проп із головної (той самий
 * `openInsightTarget`, що обслуговував акордеон): він знає і про hash, і
 * про «reports» — вид хабу, не модуль. Імперативна дія — через шину з
 * джерелом `now_pile`, як і hero з `today_focus_cta`.
 */
function useRunAction(onOpenTarget: (module: string, hash?: string) => void) {
  const navigate = useNavigate();
  return useCallback(
    (item: NowItem) => {
      const a = item.action;
      switch (a.kind) {
        case "module_action":
          if (isHubModuleId(a.module)) {
            openHubModuleWithAction(
              a.module,
              a.action as HubModuleAction,
              "now_pile",
            );
          }
          return;
        case "open_module":
          onOpenTarget(a.module, a.hash);
          return;
        case "navigate":
          void navigate(a.path);
          return;
        case "open_chat":
          emitHubBus("openChat", { message: a.prompt, autoSend: false });
          return;
        case "callback":
          a.fn();
          return;
      }
    },
    [navigate, onOpenTarget],
  );
}

const SEVERITY_ACCENT = {
  danger: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
  success: "bg-success",
} as const;

function accentOf(item: NowItem): string {
  const s = item.severity;
  return s === "danger" || s === "warning" || s === "success"
    ? SEVERITY_ACCENT[s]
    : SEVERITY_ACCENT.info;
}

interface NowRowProps {
  item: NowItem;
  onRun: (item: NowItem) => void;
  onAskAi: ((item: NowItem) => void) | null;
  askAiDisabled: boolean;
  onDismiss: (item: NowItem) => void;
}

/** Рядок купи нижче за hero: заголовок, дія, чип «AI», відкинути. */
function NowRow({
  item,
  onRun,
  onAskAi,
  askAiDisabled,
  onDismiss,
}: NowRowProps) {
  const runLabel =
    item.action.kind === "module_action"
      ? coreMessages.hub.nowPile.doIt
      : coreMessages.hub.nowPile.open;
  return (
    <div
      data-testid="now-row"
      className="relative flex gap-3 rounded-xl border border-line bg-bg px-3 py-2.5"
    >
      <div
        className={cn(
          "absolute left-0 top-3 bottom-3 w-0.5 rounded-r-full",
          accentOf(item),
        )}
        aria-hidden
      />
      <div className="pl-1 flex-1 min-w-0">
        <p className="text-style-label text-text leading-snug">
          {item.icon && ICON_NAMES.includes(item.icon) && (
            <Icon
              name={item.icon}
              size="sm"
              className="inline-block mr-1 align-middle"
              aria-hidden
            />
          )}
          {item.title}
        </p>
        {item.body && (
          <p className="text-style-caption text-muted mt-0.5 leading-relaxed">
            {item.body}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onRun(item)}
            // Кожен рядок мав однакову назву «Зробити»/«Відкрити», і в
            // списку кнопок скрінрідера їх не можна було розрізнити.
            aria-label={`${runLabel}: ${item.title}`}
            className="inline-flex items-center gap-1 touch-target rounded-lg focus-ring text-style-label font-semibold text-text hover:text-primary transition-colors"
          >
            {runLabel}
            <Icon name="chevron-right" size="xs" strokeWidth={2.5} />
          </button>
          {onAskAi && item.askAiPrompt && (
            <button
              type="button"
              onClick={() => onAskAi(item)}
              disabled={askAiDisabled}
              aria-label={
                askAiDisabled
                  ? coreMessages.hub.nowPile.askAiLimit
                  : coreMessages.hub.nowPile.askAi
              }
              className={cn(
                "touch-target inline-flex items-center gap-1 px-2 rounded-xl text-style-caption font-semibold focus-ring",
                askAiDisabled
                  ? "bg-panelHi text-muted cursor-not-allowed"
                  : "bg-brand-soft text-brand-soft-fg hover:brightness-105 active:scale-[0.98] transition-[filter,transform]",
              )}
            >
              {coreMessages.hub.nowPile.askAiChip}
            </button>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        onClick={() => onDismiss(item)}
        aria-label={coreMessages.hub.nowPile.dismiss}
        className="shrink-0 -mr-1 -mt-1 text-muted hover:text-text"
      >
        <Icon name="close" size="sm" />
      </Button>
    </div>
  );
}

export interface NowPileProps {
  /** `openInsightTarget` з `useHubDashboardState` — модуль, hash або «reports». */
  onOpenTarget: (module: string, hash?: string) => void;
}

export function NowPile({ onOpenTarget }: NowPileProps) {
  const { items, dismiss } = useNowItems();
  const run = useRunAction(onOpenTarget);
  const askAiDisabled = useAskAiQuotaExhausted();
  const [tailOpen, setTailOpen] = useState(false);

  const visible = useMemo(
    () => promoteDanger(items, NOW_PILE_VISIBLE),
    [items],
  );
  const tail = useMemo(
    () => items.filter((i) => !visible.includes(i)),
    [items, visible],
  );
  const [hero, ...rows] = visible;

  const askAi = useCallback((item: NowItem) => {
    if (!item.askAiPrompt) return;
    emitHubBus("openChat", { message: item.askAiPrompt, autoSend: false });
  }, []);

  return (
    <section aria-labelledby="now-pile-heading" className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <SectionHeading as="h2" id="now-pile-heading" size="xs" variant="muted">
          {coreMessages.hub.nowPile.heading}
        </SectionHeading>
        <span className="text-style-caption font-bold text-muted" aria-hidden>
          {items.length}
        </span>
      </div>

      {!hero ? (
        <p
          data-testid="now-empty"
          className="rounded-xl border border-line bg-bg px-3 py-3 text-style-body text-muted"
        >
          {coreMessages.hub.nowPile.empty}
        </p>
      ) : (
        <>
          <TodayFocusCard
            focus={{
              id: hero.id,
              module: hero.module,
              severity: hero.severity,
              title: hero.title,
              body: hero.body,
              icon: hero.icon,
              // `onAction` нижче ігнорує аргумент і виконує дію рядка — тут
              // це лише маркер «є куди йти» для картки.
              action:
                hero.action.kind === "open_module" ? hero.action.module : "hub",
              pwaAction:
                hero.action.kind === "module_action"
                  ? (hero.action.action as HubModuleAction)
                  : undefined,
            }}
            onAction={() => run(hero)}
            onDismiss={() => dismiss(hero)}
            onAskAi={hero.askAiPrompt ? () => askAi(hero) : undefined}
            askAiDisabled={askAiDisabled}
            kicker={false}
          />
          {rows.map((item) => (
            <NowRow
              key={item.id}
              item={item}
              onRun={run}
              onAskAi={askAi}
              askAiDisabled={askAiDisabled}
              onDismiss={dismiss}
            />
          ))}
          {tail.length > 0 && !tailOpen && (
            <button
              type="button"
              onClick={() => setTailOpen(true)}
              aria-expanded={false}
              className="w-full touch-target rounded-xl focus-ring border border-dashed border-line px-3 text-style-caption font-semibold text-muted hover:text-text hover:bg-panelHi transition-colors"
            >
              {coreMessages.hub.nowPile.more} {tail.length}
            </button>
          )}
          {tailOpen &&
            tail.map((item) => (
              <NowRow
                key={item.id}
                item={item}
                onRun={run}
                onAskAi={askAi}
                askAiDisabled={askAiDisabled}
                onDismiss={dismiss}
              />
            ))}
        </>
      )}
    </section>
  );
}
