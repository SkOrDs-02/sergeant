/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Фабрика read-path гейта для SQLite-оверлею модуля. До витягання
 * finyk/fizruk/nutrition тримали три байт-ідентичні копії цього pub-sub
 * (`sqliteReadGate.ts`), що різнились лише імʼям модуля в експортах,
 * телеметрійним ключем і одним пост-notify колбеком. Модульні файли
 * тепер — тонкі обгортки, які зберігають СВОЇ історичні імена експортів
 * (їх мокають `vi.mock`-ом 8 тест-файлів і читає Playwright smoke).
 *
 * AI-CONTEXT (DCRUD-007, mutation windows): поки в dual-write черзі є
 * enqueued-але-незавершені записи, снапшот SQLite-кешу причинно ПОЗАДУ
 * оптимістичного локального стану. Бамп тіка в цьому вікні змусив би
 * оверлей затерти щойно записану мутацію (а diff-writer ескалював би це
 * у хибний delete). Черга відкриває вікно на кожен enqueue і закриває
 * після apply → refresh; notify відкладається, поки відкрите бодай одне
 * вікно — фінальний quiescent notify черги доставляє рівно один
 * причинно-останній снапшот.
 *
 * AI-DANGER: глобальний лічильник `__sergeantSqliteRefreshCounts` і подія
 * `sergeant:sqlite-cache-refresh` — публічний контракт Playwright smoke
 * (`tests/smoke/smokeHelpers.ts`, `deep-module-crud.spec.ts`). Не
 * перейменовувати.
 */
import { useSyncExternalStore } from "react";

export interface SqliteReadGate {
  /** React-хук: ре-рендерить підписників на кожен успішний notify. */
  useReadTick(): number;
  /** Бамп тіка + fan-out підписникам (no-op, поки відкриті mutation windows). */
  notifyCacheRefresh(): void;
  /** Відкривається dual-write чергою на enqueue (по одному на запис). */
  openMutationWindow(): void;
  /** Закривається чергою після apply → refresh. */
  closeMutationWindow(): void;
  /** Test-only: чистить підписників і скидає стан. */
  resetForTests(): void;
}

export interface CreateSqliteReadGateOptions {
  /**
   * Додатковий fan-out після успішного notify (fizruk: `emitHubBus`, щоб
   * Hub Reports/Dashboard пере-агрегувались у тій же вкладці одразу).
   */
  onAfterNotify?: () => void;
}

export function createSqliteReadGate(
  moduleId: string,
  options: CreateSqliteReadGateOptions = {},
): SqliteReadGate {
  let cacheTick = 0;
  let pendingMutationWindows = 0;
  const listeners = new Set<() => void>();

  function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }

  function getSnapshot(): number {
    return cacheTick;
  }

  function useReadTick(): number {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  function notifyCacheRefresh(): void {
    if (pendingMutationWindows > 0) return;
    cacheTick += 1;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* noop — listeners must never break notify */
      }
    }
    try {
      const target = globalThis as typeof globalThis & {
        __sergeantSqliteRefreshCounts?: Record<string, number>;
      };
      target.__sergeantSqliteRefreshCounts = {
        ...(target.__sergeantSqliteRefreshCounts ?? {}),
        [moduleId]: (target.__sergeantSqliteRefreshCounts?.[moduleId] ?? 0) + 1,
      };
      globalThis.dispatchEvent?.(
        new CustomEvent("sergeant:sqlite-cache-refresh", {
          detail: { module: moduleId },
        }),
      );
    } catch {
      /* noop — browser-test signal must never break refresh notify */
    }
    options.onAfterNotify?.();
  }

  return {
    useReadTick,
    notifyCacheRefresh,
    openMutationWindow: () => {
      pendingMutationWindows += 1;
    },
    closeMutationWindow: () => {
      pendingMutationWindows = Math.max(0, pendingMutationWindows - 1);
    },
    resetForTests: () => {
      cacheTick = 0;
      pendingMutationWindows = 0;
      listeners.clear();
    },
  };
}
