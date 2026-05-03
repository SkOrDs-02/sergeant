import { useEffect, useMemo, useRef } from "react";
import {
  pickNextHint,
  recordHintShown,
  getRetentionHintId,
  canShowHint,
  getFirstActionStartedAt,
  type HintContext,
  type HintId,
} from "@sergeant/shared";
import { useToast } from "@shared/hooks/useToast";
import { webKVStore } from "@shared/lib/storage/storage";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";
import { useHubPref } from "../settings/hubPrefs";

export interface HintsOrchestratorProps {
  inFtuxSession: boolean;
  hasFirstRealEntry: boolean;
}

export function HintsOrchestrator({
  inFtuxSession,
  hasFirstRealEntry,
}: HintsOrchestratorProps): null {
  const toast = useToast();
  const [showHints] = useHubPref<boolean>("showHints", true);
  const shownThisMount = useRef<HintId | null>(null);

  const ctx = useMemo<HintContext>(
    () => ({
      platform: "web",
      surface: "hub",
      inFtuxSession,
      hasFirstRealEntry,
    }),
    [hasFirstRealEntry, inFtuxSession],
  );

  const candidates = useMemo<readonly HintId[]>(() => {
    if (inFtuxSession) {
      return [
        "ftux_quick_add",
        "ftux_switch_modules",
        "ftux_open_search",
        "ftux_open_chat",
        "ftux_reports_unlock",
      ];
    }
    if (hasFirstRealEntry) {
      return ["module_first_entry", "hub_reorder_modules"];
    }
    return [];
  }, [hasFirstRealEntry, inFtuxSession]);

  useEffect(() => {
    if (!showHints) return;
    if (shownThisMount.current) return;

    // Delay hint showing to let the user orient themselves first
    const timer = setTimeout(() => {
      showHintIfEligible();
    }, 2500);

    return () => clearTimeout(timer);

    function showHintIfEligible() {
      // ── Retention hints (Day 1 / 3 / 7) take priority over general hints
      if (hasFirstRealEntry) {
        const startedAt = getFirstActionStartedAt(webKVStore);
        if (startedAt) {
          const retentionId = getRetentionHintId(startedAt);
          if (retentionId) {
            const res = canShowHint(webKVStore, retentionId, ctx);
            if (res.ok) {
              shownThisMount.current = retentionId;
              recordHintShown(webKVStore, retentionId);
              const def = {
                retention_day_1:
                  "Перший день — вже здобуток! Повернись завтра — звичка формується з трьох повторень.",
                retention_day_3:
                  "3 дні поспіль — стрік почався. Ще кілька днів і мозок зафіксує нову звичку.",
                retention_day_7:
                  "Тиждень — серйозна заявка! 7 днів поспіль доведено підвищують шанс закріпити звичку.",
              }[retentionId];
              if (def) {
                toast.info(def, 6000);
                return;
              }
            }
          }
        }
      }

      if (candidates.length === 0) return;
      const next = pickNextHint(webKVStore, candidates, ctx);
      if (!next) return;

      shownThisMount.current = next;
      recordHintShown(webKVStore, next);
      trackEvent(ANALYTICS_EVENTS.HINT_SHOWN, {
        id: next,
        surface: ctx.surface,
        platform: ctx.platform,
        inFtuxSession: Boolean(ctx.inFtuxSession),
        hasFirstRealEntry: Boolean(ctx.hasFirstRealEntry),
      });

      const msg = (() => {
        switch (next) {
          case "ftux_open_search":
            return "Порада: відкрий пошук (⌘K) — швидко знаходить модулі та дії.";
          case "ftux_open_chat":
            return "Порада: спитай у чаті «Що мені важливо сьогодні?»";
          case "ftux_switch_modules":
            return "Перемикай модулі зверху — це один хаб.";
          case "ftux_reports_unlock":
            return "Звіти з'являться після першого запису.";
          case "ftux_quick_add":
            return "Швидке додавання — найкоротший шлях до результату.";
          case "module_first_entry":
            return "Після першого запису спробуй «Звіти» — там найшвидше видно прогрес.";
          case "hub_reorder_modules":
            return "Можна переставити модулі: Налаштування → Загальні → Упорядкувати.";
          default:
            return null;
        }
      })();

      if (!msg) return;

      const action =
        next === "ftux_open_chat"
          ? {
              label: "Відкрити чат",
              onClick: () => {
                try {
                  emitHubBus("openChat", {
                    message: "Що мені важливо сьогодні?",
                  });
                  trackEvent(ANALYTICS_EVENTS.HINT_CLICKED, { id: next });
                } catch {
                  /* noop */
                }
              },
            }
          : next === "ftux_open_search"
            ? {
                label: "Пошук",
                onClick: () => {
                  try {
                    emitHubBus("openSearch", undefined);
                    trackEvent(ANALYTICS_EVENTS.HINT_CLICKED, { id: next });
                  } catch {
                    /* noop */
                  }
                },
              }
            : undefined;

      toast.info(msg, 5000, action);
    }
  }, [candidates, ctx, hasFirstRealEntry, showHints, toast]);

  return null;
}
