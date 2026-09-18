import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  isValidElement,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
  /** Optional explicit alternative that only dismisses the toast. */
  dismissLabel?: string;
  /**
   * `"undo"` позначає дію як відкат щойно виконаного (`showUndoToast` і
   * два ручні «Скасувати» в Харчуванні). Саме такі тости знаходить
   * глобальний `Cmd/Ctrl+Z` (`RootLayout`): вікно undo живе рівно
   * стільки, скільки тост на екрані, і окремого стеку не потрібно.
   * Інші дії (retry, «Оновити», «Перейти») клавіша не чіпає.
   */
  kind?: "undo";
}

export interface ToastItem {
  id: number;
  msg: ReactNode;
  type: ToastType;
  action: ToastAction | null;
  /**
   * Auto-dismiss duration, captured at the moment `show()` was called.
   * Exposed so `<ToastContainer>` can drive a CSS-based countdown ring/bar
   * (animation-duration is set inline) without re-deriving it from the
   * default-by-type table.
   */
  duration: number | null;
  /**
   * How many times this exact message was raised while it was on screen.
   * `1` for a normal toast; `>1` after coalescing (див. `show()`), and the
   * row renders a `×N` badge instead of stacking N identical sheets.
   */
  repeat: number;
  /** Set to true during the exit animation before actual removal. */
  leaving?: boolean;
}

export interface ToastApi {
  show: (
    msg: ReactNode,
    type?: ToastType,
    duration?: number | null,
    action?: ToastAction,
  ) => number;
  success: (
    msg: ReactNode,
    duration?: number | null,
    action?: ToastAction,
  ) => number;
  error: (
    msg: ReactNode,
    duration?: number | null,
    action?: ToastAction,
  ) => number;
  info: (
    msg: ReactNode,
    duration?: number | null,
    action?: ToastAction,
  ) => number;
  warning: (
    msg: ReactNode,
    duration?: number | null,
    action?: ToastAction,
  ) => number;
  dismiss: (id: number) => void;
  /**
   * Pause the auto-dismiss countdown for the toast `id`. Idempotent — calling
   * twice in a row is a no-op. Used by `<ToastContainer>` on hover / focus /
   * touch-drag so a screen-reader user (or anyone re-reading the message) has
   * unbounded time before the toast self-destructs. Pair with `resume(id)`.
   */
  pause: (id: number) => void;
  /**
   * Resume a paused auto-dismiss countdown. Idempotent if the toast is not
   * currently paused or has already been dismissed. Restarts the timer with
   * whatever remained when `pause()` was called.
   */
  resume: (id: number) => void;
}

export interface ToastContextValue extends ToastApi {
  /**
   * Усі живі тости — видимі + ті, що чекають у черзі. Рендерити наосліп не
   * можна: `<ToastContainer>` показує лише перші `MAX_VISIBLE_TOASTS`
   * (див. нижче), решта чекає вільного слота.
   */
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 5000,
};

/**
 * Скільки тостів одночасно на екрані.
 *
 * AI-CONTEXT: до 2026-08 тут було 5 (`prev.slice(-4)` + append), і при
 * серії швидких дій (свайп-приховування трьох транзакцій, три quick-chip-и
 * поспіль) екран заростав вежею на ~300 px — на 667-px вʼюпорті це майже
 * половина висоти. Три — це стеля, на якій ще видно вміст під тостами, і
 * та сама межа, що її тримають Sonner / react-hot-toast за замовчуванням.
 * Material Design узагалі дозволяє один snackbar; перехід на «один слот»
 * — це продуктове рішення, не міняй його тут без узгодження.
 */
export const MAX_VISIBLE_TOASTS = 3;

/**
 * Скільки тостів може чекати в черзі понад видимі. Понад це — найстаріший
 * *невидимий* (той, що ще не показувався, тож і таймера не має) тихо
 * викидається: краще втратити 9-й тост із пачки, ніж тримати нескінченний
 * буфер і показувати користувачу хвіст із подій хвилинної давнини.
 */
const MAX_QUEUED_TOASTS = 5;

/** Тривалість exit-анімації; має збігатися з `.animate-toast-exit`. */
const EXIT_ANIMATION_MS = 200;

let idCounter = 0;

/**
 * Ключ для коалесингу однакових тостів. `null` — коалесити не можна.
 *
 * Коалесимо ЛИШЕ тости без `action`. Тост з action несе власне замикання
 * (undo конкретного запису, retry конкретного запиту) — злиття двох таких
 * означало б тихо втратити можливість скасувати першу дію. А ось три
 * однакові «Збережено» несуть нуль додаткової інформації і лише займають
 * екран. Non-string `msg` (ReactNode) не порівнюємо — глибока рівність
 * елементів дорожча за користь.
 *
 * Роздільник — `\0` як ESCAPE-послідовність, не літеральний байт. До
 * 2026-09-17 у файлі стояв справжній U+0000: `file(1)` класифікував його
 * як `data`, а ripgrep і grep мовчки пропускали ці 400+ рядків у кожному
 * repo-wide скані як «binary file». Сам ключ від цього не змінився.
 */
function coalesceKey(msg: ReactNode, type: ToastType, hasAction: boolean) {
  if (hasAction) return null;
  if (typeof msg !== "string" && typeof msg !== "number") return null;
  if (isValidElement(msg)) return null;
  return `${type}\0${String(msg)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  /**
   * Джерело правди — ref, а не state.
   *
   * AI-CONTEXT: коалесинг і черга мають читати актуальний список
   * СИНХРОННО (чотири `toast.error` в одному `Promise.allSettled`-тіку
   * приходять до того, як React встигне зробити re-render). Класичний
   * `setToasts(prev => …)` тут не годиться двічі: (1) рішення «злити чи
   * додати» довелося б приймати всередині updater-а, а це побічний ефект,
   * який StrictMode виконає двічі й лічильник `repeat` подвоїться;
   * (2) `show` мусив би тримати `toasts` у deps, тобто міняти identity на
   * кожен тост — а `toast` лежить у deps-масивах десятків
   * `useCallback`/`useEffect` по всьому застосунку.
   *
   * Тому: усі мутації йдуть у `listRef`, а `commit()` віддзеркалює його в
   * state одним новим масивом. `commit` ідемпотентний, тож StrictMode
   * нешкідливий.
   */
  const listRef = useRef<ToastItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Timestamp (ms) when the current timer started (for the active id);
  // combined with `remainingRef` to compute time-left on pause.
  const startedAtRef = useRef<Record<number, number>>({});
  // Milliseconds left for the auto-dismiss countdown. When the timer is
  // running, this matches the duration passed to `setTimeout`; on pause we
  // overwrite it with `remaining - (now - startedAt)`.
  const remainingRef = useRef<Record<number, number>>({});
  // Ідентифікатори тостів, у яких відлік свідомо зупинений (hover / focus /
  // touch-drag). Без цього реєстру `syncTimers()` перезапускав би таймер
  // одразу після `pause()`.
  const pausedRef = useRef<Set<number>>(new Set());
  /**
   * Таймери exit-анімації — ОКРЕМО від auto-dismiss.
   *
   * AI-DANGER: не зливай ці два реєстри в один. `pause()` гасить усе, що
   * лежить у `timersRef`, а на аркуші, що вже їде геть, hover цілком можливий
   * (200 мс він ще на екрані). Спільний реєстр означав би: навів мишу під час
   * зникнення → exit-таймер убито → `remove(id)` не викликається → тост
   * назавжди лишається у `toasts` привидом.
   */
  const exitTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>(
    {},
  );

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      // Cleanup гасить рівно те, що зареєстровано, тож exit-таймери мусять
      // бути тут. «Голий» `setTimeout` переживав unmount і через 200 мс кликав
      // `setToasts` на розмонтованому дереві: у застосунку —
      // setState-after-unmount, у Vitest — падіння всього прогону (таймер
      // спрацьовував після teardown-у jsdom, і React звертався до неіснуючого
      // `window`: «ReferenceError: window is not defined» у
      // `getCurrentEventPriority`). 9178 тестів зелені, job червоний через
      // один осиротілий таймер.
      Object.values(exitTimersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      exitTimersRef.current = {};
      startedAtRef.current = {};
      remainingRef.current = {};
      pausedRef.current = new Set();
      listRef.current = [];
    };
  }, []);

  const commit = useCallback(() => {
    setToasts(listRef.current.slice());
  }, []);

  const clearAutoDismiss = useCallback((id: number) => {
    const timer = timersRef.current[id];
    if (timer) clearTimeout(timer);
    delete timersRef.current[id];
  }, []);

  const remove = useCallback(
    (id: number) => {
      listRef.current = listRef.current.filter((t) => t.id !== id);
      delete startedAtRef.current[id];
      delete remainingRef.current[id];
      pausedRef.current.delete(id);
      commit();
    },
    [commit],
  );

  const dismiss = useCallback(
    (id: number) => {
      clearAutoDismiss(id);
      // Auto-dismiss для цього тоста вже не відновиться — прибираємо його
      // бухгалтерію, щоб `resume()` не спробував перезапустити відлік по
      // застарілому `remaining`, поки аркуш їде геть.
      delete startedAtRef.current[id];
      delete remainingRef.current[id];
      pausedRef.current.delete(id);
      const target = listRef.current.find((t) => t.id === id);
      if (!target || target.leaving) return;
      // Mark as leaving → triggers exit animation in <ToastContainer>.
      // After 200ms (matches the CSS exit transition), actually remove.
      listRef.current = listRef.current.map((t) =>
        t.id === id ? { ...t, leaving: true } : t,
      );
      commit();
      exitTimersRef.current[id] = setTimeout(() => {
        delete exitTimersRef.current[id];
        remove(id);
      }, EXIT_ANIMATION_MS);
    },
    [clearAutoDismiss, commit, remove],
  );

  /**
   * Запустити відлік для кожного тоста, що зараз у видимому вікні і ще не
   * має живого таймера. Саме так тост із черги отримує таймер рівно тоді,
   * коли піднявся у видимі, а не поки чекав унизу невидимим.
   *
   * Ідемпотентна: повторний виклик нічого не перезапускає — тому її
   * безпечно смикати і синхронно (`show` / `resume`), і з ефекту нижче.
   */
  const syncTimers = useCallback(() => {
    let slot = 0;
    for (const toast of listRef.current) {
      if (toast.leaving) continue;
      if (slot >= MAX_VISIBLE_TOASTS) break;
      slot += 1;
      if (timersRef.current[toast.id]) continue;
      if (pausedRef.current.has(toast.id)) continue;
      // `null` is the explicit persistent-toast contract. It owns no timer
      // and stays visible until an action, dismiss button, swipe or Esc.
      if (toast.duration === null) continue;
      const remaining = remainingRef.current[toast.id] ?? toast.duration;
      remainingRef.current[toast.id] = remaining;
      startedAtRef.current[toast.id] = Date.now();
      timersRef.current[toast.id] = setTimeout(
        () => dismiss(toast.id),
        remaining,
      );
    }
  }, [dismiss]);

  // Звільнився слот (тост поїхав / прибрався) → наступний із черги стає
  // видимим і аж тоді починає «горіти». Ефект, а не виклик усередині
  // `dismiss`, щоб не заводити цикл `dismiss → syncTimers → dismiss`.
  useEffect(() => {
    syncTimers();
  }, [toasts, syncTimers]);

  const pause = useCallback(
    (id: number) => {
      pausedRef.current.add(id);
      if (!timersRef.current[id]) return;
      clearAutoDismiss(id);
      const startedAt = startedAtRef.current[id];
      const remaining = remainingRef.current[id];
      if (startedAt != null && remaining != null) {
        const elapsed = Date.now() - startedAt;
        remainingRef.current[id] = Math.max(0, remaining - elapsed);
      }
    },
    [clearAutoDismiss],
  );

  const resume = useCallback(
    (id: number) => {
      pausedRef.current.delete(id);
      if (timersRef.current[id]) return; // already running
      const remaining = remainingRef.current[id];
      if (remaining == null || remaining <= 0) return;
      syncTimers();
    },
    [syncTimers],
  );

  const show = useCallback<ToastApi["show"]>(
    (msg, type = "success", duration, action) => {
      const a: ToastAction | null =
        action &&
        typeof action === "object" &&
        typeof action.onClick === "function"
          ? {
              label: String(action.label || "Дія"),
              onClick: action.onClick,
              ...(action.dismissLabel
                ? { dismissLabel: String(action.dismissLabel) }
                : {}),
              ...(action.kind === "undo" ? { kind: "undo" as const } : {}),
            }
          : null;
      // `undefined` means "use the semantic default"; `null` deliberately
      // means "do not auto-dismiss".
      const d = duration === undefined ? DEFAULT_DURATION[type] : duration;

      // 1. Коалесинг — та сама подія вдруге поспіль не займає новий слот.
      const key = coalesceKey(msg, type, !!a);
      if (key != null) {
        const twin = listRef.current.find(
          (t) => !t.leaving && coalesceKey(t.msg, t.type, !!t.action) === key,
        );
        if (twin) {
          listRef.current = listRef.current.map((t) =>
            t.id === twin.id ? { ...t, repeat: t.repeat + 1, duration: d } : t,
          );
          // Відлік починається спочатку: подія щойно повторилась, тож у
          // користувача знову є повний час її прочитати.
          clearAutoDismiss(twin.id);
          if (d !== null) remainingRef.current[twin.id] = d;
          commit();
          syncTimers();
          return twin.id;
        }
      }

      // 2. Новий тост у хвіст. Таймер поставить `syncTimers()` — і лише
      //    якщо тост потрапив у видиме вікно.
      const id = ++idCounter;
      listRef.current = [
        ...listRef.current,
        { id, msg, type, action: a, duration: d, repeat: 1 },
      ];

      // 3. Кеп на глибину черги. Ріжемо найстаріший ЗАЧЕРГОВАНИЙ (перший за
      //    межею видимого вікна) — у нього ще немає ані таймера, ані
      //    бухгалтерії, тож і чистити нічого.
      if (listRef.current.length > MAX_VISIBLE_TOASTS + MAX_QUEUED_TOASTS) {
        const dropIndex = listRef.current.findIndex(
          (_, i) => i >= MAX_VISIBLE_TOASTS,
        );
        if (dropIndex >= 0) {
          listRef.current = listRef.current.filter((_, i) => i !== dropIndex);
        }
      }

      commit();
      syncTimers();
      return id;
    },
    [clearAutoDismiss, commit, syncTimers],
  );

  const success = useCallback<ToastApi["success"]>(
    (msg, duration, action) => show(msg, "success", duration, action),
    [show],
  );
  const error = useCallback<ToastApi["error"]>(
    (msg, duration, action) => show(msg, "error", duration, action),
    [show],
  );
  const info = useCallback<ToastApi["info"]>(
    (msg, duration, action) => show(msg, "info", duration, action),
    [show],
  );
  const warning = useCallback<ToastApi["warning"]>(
    (msg, duration, action) => show(msg, "warning", duration, action),
    [show],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, success, error, info, warning, dismiss, pause, resume }),
    [show, success, error, info, warning, dismiss, pause, resume],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ ...api, toasts }),
    [api, toasts],
  );

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
