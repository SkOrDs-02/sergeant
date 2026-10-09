/**
 * Купа «Зараз» — перша з двох куп осі дії (A1, спека `hub-action-axis.md`),
 * у формі мови H (redesign v3): кожен пункт це рядок 56 px на hairline —
 * чекбокс 22 px, назва 16 / 600, підзаголовок 14 другим сірим, праворуч
 * дрібна дія 36 px із назвою-результатом. Без смужки, чипа «Сержант» і «×».
 *
 * Cap за рішенням власника 2026-09-17: **3 розгорнуто + «ще N»**; рядок із
 * `severity: "danger"` завжди пробивається в трійку. Чекбокс закриває пункт
 * до кінця доби, і він переходить у «Закрито» (`ClosedTodayPile`).
 *
 * Стан купи приходить пропом `now` з `HubDashboard`: «Закрито» читає той
 * самий стан.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import {
  openHubModuleWithAction,
  isHubModuleId,
  type HubModuleAction,
} from "@shared/lib/modules/hubNav";
import { getModulePrimaryAction } from "@shared/lib/modules/moduleQuickActions";
import { coreMessages } from "@shared/i18n/uk.core";
import { MODULE_OPEN_CTA } from "../../insights/dashboardFocus";
import { ANALYTICS_EVENTS, trackEvent } from "../../observability/analytics";
import type { UseNowItemsResult } from "./useNowItems";
import { usePublishHubDayCount } from "./hubDayCounts";
import type { NowItem } from "./nowItems";
import { ChecklistNowRows, type ChecklistNowProps } from "./ChecklistNowRows";

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

/** Назва-результат дії рядка: «Додати витрату», «Відкрити Рутину». */
export function actionLabel(item: NowItem): string {
  const a = item.action;
  if (a.kind === "module_action") {
    return (
      getModulePrimaryAction(a.module)?.label ??
      MODULE_OPEN_CTA[a.module] ??
      coreMessages.hub.nowPile.doIt
    );
  }
  if (a.kind === "open_module") {
    return MODULE_OPEN_CTA[a.module] ?? coreMessages.hub.nowPile.open;
  }
  if (a.kind === "open_week_report") {
    return coreMessages.hub.nowPile.openWeekReport;
  }
  return coreMessages.hub.nowPile.open;
}

/**
 * Куди веде рядок. `open_module` іде через проп із головної (той самий
 * `openInsightTarget`, що обслуговував акордеон): він знає про hash, але
 * лише для id МОДУЛЯ. Вид хабу, не модуль, — це окремі види дії:
 * `open_week_report` (подія шини) і `navigate` (`/?tab=reports`).
 * Імперативна дія — через шину з джерелом `now_pile`.
 */
function useRunAction(onOpenTarget: (module: string, hash?: string) => void) {
  const navigate = useNavigate();
  return useCallback(
    (item: NowItem, source: "today_focus_cta" | "now_pile") => {
      const a = item.action;
      switch (a.kind) {
        case "module_action":
          if (isHubModuleId(a.module)) {
            openHubModuleWithAction(
              a.module,
              a.action as HubModuleAction,
              source,
            );
          }
          return;
        case "open_module":
          onOpenTarget(a.module, a.hash);
          return;
        case "open_week_report":
          // Слухач — `HubInsightsBlock`: розгортає блок і веде до рядків
          // тижня. Коли блок вимкнено в налаштуваннях, `useNowItems`
          // підміняє дію ще до цього місця.
          emitHubBus("openWeekReport", undefined);
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

interface NowRowProps {
  item: NowItem;
  onRun: (item: NowItem) => void;
  onCheck: (item: NowItem) => void;
}

function NowRow({ item, onRun, onCheck }: NowRowProps) {
  const label = actionLabel(item);
  return (
    <li data-testid="now-row" className="flex min-h-14 items-center gap-3 py-2">
      <button
        type="button"
        role="checkbox"
        aria-checked={false}
        aria-label={`${coreMessages.hub.nowPile.check}: ${item.title}`}
        onClick={() => onCheck(item)}
        className="-m-[11px] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg focus-ring"
      >
        <span
          aria-hidden
          className="h-[22px] w-[22px] rounded-[5px] border-2 border-control"
        />
      </button>
      <span className="min-w-0 flex-1 pl-2">
        <span
          className={
            item.severity === "danger"
              ? "block text-style-body font-semibold leading-snug text-danger-strong"
              : "block text-style-body font-semibold leading-snug text-text"
          }
        >
          {item.title}
        </span>
        {item.body && (
          <span className="mt-0.5 block text-style-label text-muted">
            {item.body}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => onRun(item)}
        // Кілька рядків можуть мати однакову дію («Відкрити Фінік»), і в
        // списку кнопок скрінрідера їх не можна було б розрізнити.
        aria-label={`${label}: ${item.title}`}
        className="h-9 max-w-[45%] shrink-0 truncate rounded-[7px] border border-border-strong px-3 text-style-label font-semibold text-text hover:bg-panel focus-ring touch-target"
      >
        {label}
      </button>
    </li>
  );
}

export interface NowPileProps {
  /** Стан купи з `useNowItems`, піднятий у `HubDashboard`. */
  now: UseNowItemsResult;
  /** `openInsightTarget` з `useHubDashboardState` — id модуля й, за потреби, hash усередині нього. */
  onOpenTarget: (module: string, hash?: string) => void;
  /** Незроблені кроки онбордингу - рядки над рештою купи. */
  checklist?: ChecklistNowProps | undefined;
}

export function NowPile({ now, onOpenTarget, checklist }: NowPileProps) {
  const { items, check } = now;
  const runAction = useRunAction(onOpenTarget);
  const [tailOpen, setTailOpen] = useState(false);
  const total = items.length + (checklist?.steps.length ?? 0);
  usePublishHubDayCount("now", total);

  const visible = useMemo(
    () => promoteDanger(items, NOW_PILE_VISIBLE),
    [items],
  );
  const tail = useMemo(
    () => items.filter((i) => !visible.includes(i)),
    [items, visible],
  );

  // Подія і джерело колишньої картки «Зараз» лишаються на верхньому рядку:
  // дашборди осі дії рахують саме їх (`analyticsEvents.hubAxis.ts`).
  const run = useCallback(
    (item: NowItem) => {
      const top = item === visible[0];
      if (top) {
        trackEvent(ANALYTICS_EVENTS.TODAY_FOCUS_CTA_CLICKED, {
          rec_id: item.id,
          module: item.module,
          kind: "primary",
          has_pwa_action: item.action.kind === "module_action",
        });
      }
      runAction(item, top ? "today_focus_cta" : "now_pile");
    },
    [runAction, visible],
  );

  const hasChecklist = Boolean(checklist && checklist.steps.length > 0);
  const rows = tailOpen ? [...visible, ...tail] : visible;

  return (
    <section aria-labelledby="now-pile-heading">
      <SectionHeading as="h2" size="lg" id="now-pile-heading" meta={total}>
        {coreMessages.hub.nowPile.heading}
      </SectionHeading>

      {rows.length === 0 && !hasChecklist ? (
        <p data-testid="now-empty" className="mt-2 text-style-body text-muted">
          {coreMessages.hub.nowPile.empty}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line border-y border-line">
          {hasChecklist && checklist && <ChecklistNowRows {...checklist} />}
          {rows.map((item) => (
            <NowRow key={item.id} item={item} onRun={run} onCheck={check} />
          ))}
        </ul>
      )}

      {/* Один перемикач на обидва стани: той самий DOM-вузол, тож фокус
          клавіатури не губиться при перемиканні. */}
      {tail.length > 0 && (
        <button
          type="button"
          onClick={() => setTailOpen((open) => !open)}
          aria-expanded={tailOpen}
          className="mt-1 min-h-11 text-style-label font-semibold text-muted hover:text-text focus-ring"
        >
          {tailOpen
            ? coreMessages.actions.collapse
            : `${coreMessages.hub.nowPile.more} ${tail.length}`}
        </button>
      )}
    </section>
  );
}
