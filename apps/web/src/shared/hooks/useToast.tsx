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
}

export interface ToastContextValue extends ToastApi {
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimeout(timersRef.current[id]);
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

  const show = useCallback<ToastApi["show"]>(
    (msg, type = "success", duration = 3500, action) => {
      const id = ++idCounter;
      const a: ToastAction | null =
        action &&
        typeof action === "object" &&
        typeof action.onClick === "function"
          ? { label: String(action.label || "Дія"), onClick: action.onClick }
          : null;
      setToasts((prev) => [...prev.slice(-4), { id, msg, type, action: a }]);
      timersRef.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const success = useCallback<ToastApi["success"]>(
    (msg, duration, action) => show(msg, "success", duration, action),
    [show],
  );
  const error = useCallback<ToastApi["error"]>(
    (msg, duration, action) => show(msg, "error", duration ?? 5000, action),
    [show],
  );
  const info = useCallback<ToastApi["info"]>(
    (msg, duration, action) => show(msg, "info", duration, action),
    [show],
  );
  const warning = useCallback<ToastApi["warning"]>(
    (msg, duration, action) => show(msg, "warning", duration ?? 5000, action),
    [show],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, success, error, info, warning, dismiss }),
    [show, success, error, info, warning, dismiss],
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
