import { useEffect, useMemo, useRef } from "react";
import {
  pickNextHint,
  recordHintShown,
  getRetentionHintId,
  canShowHint,
  getFirstActionStartedAt,
  STORAGE_KEYS,
  type HintContext,
  type HintId,
  type KVStore,
} from "@sergeant/shared";

import { useToast } from "@/components/ui/Toast";
import { useLocalStorage } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

interface HubPrefs {
  showHints?: boolean;
}

export interface UseHintsOptions {
  store: KVStore;
  inFtuxSession: boolean;
  hasFirstRealEntry: boolean;
}

export function useHints({
  store,
  inFtuxSession,
  hasFirstRealEntry,
}: UseHintsOptions) {
  const toast = useToast();
  const [prefs] = useLocalStorage<HubPrefs>(STORAGE_KEYS.HUB_PREFS, {});
  const showHints = prefs.showHints !== false;
  const shownThisMount = useRef<HintId | null>(null);

  const ctx = useMemo<HintContext>(
    () => ({
      platform: "mobile",
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
        "ftux_open_chat",
        "ftux_reports_unlock",
        "ftux_swipe_to_delete",
      ];
    }
    if (hasFirstRealEntry) {
      return [
        "module_first_entry",
        "hub_reorder_modules",
        "ftux_swipe_to_delete",
      ];
    }
    return [];
  }, [hasFirstRealEntry, inFtuxSession]);

  useEffect(() => {
    if (!showHints) return;
    if (shownThisMount.current) return;

    // ── Retention hints (Day 1 / 3 / 7) take priority
    if (hasFirstRealEntry) {
      const startedAt = getFirstActionStartedAt(store);
      if (startedAt) {
        const retentionId = getRetentionHintId(startedAt);
        if (retentionId) {
          const res = canShowHint(store, retentionId, ctx);
          if (res.ok) {
            shownThisMount.current = retentionId;
            recordHintShown(store, retentionId);
            const msg = {
              retention_day_1:
                "Перший день — вже здобуток! Поверніться завтра.",
              retention_day_3: "3 дні поспіль — стрік почався!",
              retention_day_7: "Тиждень — серйозна заявка! 7 днів поспіль.",
            }[retentionId];
            if (msg) {
              toast.info(msg, 6000);
              return;
            }
          }
        }
      }
    }

    if (candidates.length === 0) return;
    const next = pickNextHint(store, candidates, ctx);
    if (!next) return;

    shownThisMount.current = next;
    recordHintShown(store, next);
    trackEvent(ANALYTICS_EVENTS.HINT_SHOWN, {
      id: next,
      surface: ctx.surface,
      platform: ctx.platform,
      inFtuxSession: Boolean(ctx.inFtuxSession),
      hasFirstRealEntry: Boolean(ctx.hasFirstRealEntry),
    });

    const msg = (() => {
      switch (next) {
        case "ftux_open_chat":
          return "Порада: в чаті спитай «Що мені важливо сьогодні?»";
        case "ftux_switch_modules":
          return "Перемикай модулі внизу — це один хаб.";
        case "ftux_reports_unlock":
          return "Звіти з’являться після першого запису.";
        case "ftux_quick_add":
          return "Швидке додавання — найкоротший шлях до результату.";
        case "module_first_entry":
          return "Після першого запису спробуй «Звіти» — там найшвидше видно прогрес.";
        case "hub_reorder_modules":
          return "Можна переставити модулі в Налаштуваннях → Загальні.";
        case "ftux_swipe_to_delete":
          return "Порада: потягни запис вліво, щоб видалити.";
        default:
          return null;
      }
    })();

    if (!msg) return;
    toast.info(msg, 5000);
  }, [candidates, ctx, hasFirstRealEntry, showHints, store, toast]);
}
