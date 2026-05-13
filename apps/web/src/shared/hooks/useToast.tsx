import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onClick: () => void;
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
  duration: number;
  /** Set to true during the exit animation before actual removal. */
  leaving?: boolean;
}

export interface ToastApi {
  show: (
    msg: ReactNode,
    type?: ToastType,
    duration?: number,
    action?: ToastAction,
  ) => number;
  success: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  error: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  info: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  warning: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
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
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 3500,
  warning: 5000,
  error: 5000,
};

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Timestamp (ms) when the current timer started (for the active id);
  // combined with `remainingRef` to compute time-left on pause.
  const startedAtRef = useRef<Record<number, number>>({});
  // Milliseconds left for the auto-dismiss countdown. When the timer is
  // running, this matches the duration passed to `setTimeout`; on pause we
  // overwrite it with `remaining - (now - startedAt)`.
  const remainingRef = useRef<Record<number, number>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      startedAtRef.current = {};
      remainingRef.current = {};
    };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    delete startedAtRef.current[id];
    delete remainingRef.current[id];
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      const timer = timersRef.current[id];
      if (timer) clearTimeout(timer);
      delete timersRef.current[id];
      // Mark as leaving → triggers exit animation in <ToastContainer>.
      // After 200ms (matches the CSS exit transition), actually remove.
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      setTimeout(() => remove(id), 200);
    },
    [remove],
  );

  const pause = useCallback((id: number) => {
    const timer = timersRef.current[id];
    if (!timer) return;
    clearTimeout(timer);
    delete timersRef.current[id];
    const startedAt = startedAtRef.current[id];
    const remaining = remainingRef.current[id];
    if (startedAt != null && remaining != null) {
      const elapsed = Date.now() - startedAt;
      remainingRef.current[id] = Math.max(0, remaining - elapsed);
    }
  }, []);

  const resume = useCallback(
    (id: number) => {
      if (timersRef.current[id]) return; // already running
      const remaining = remainingRef.current[id];
      if (remaining == null || remaining <= 0) return;
      startedAtRef.current[id] = Date.now();
      timersRef.current[id] = setTimeout(() => dismiss(id), remaining);
    },
    [dismiss],
  );

  const show = useCallback<ToastApi["show"]>(
    (msg, type = "success", duration, action) => {
      const id = ++idCounter;
      const a: ToastAction | null =
        action &&
        typeof action === "object" &&
        typeof action.onClick === "function"
          ? { label: String(action.label || "Дія"), onClick: action.onClick }
          : null;
      const d = duration ?? DEFAULT_DURATION[type];
      setToasts((prev) => [
        ...prev.slice(-4),
        { id, msg, type, action: a, duration: d },
      ]);
      startedAtRef.current[id] = Date.now();
      remainingRef.current[id] = d;
      timersRef.current[id] = setTimeout(() => dismiss(id), d);
      return id;
    },
    [dismiss],
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
