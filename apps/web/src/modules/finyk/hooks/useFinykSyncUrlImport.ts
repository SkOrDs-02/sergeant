import { useEffect, useRef } from "react";
import type { ToastApi } from "@shared/hooks/useToast";

export interface UseFinykSyncUrlImportArgs {
  loadFromUrl: () => boolean;
  toast: ToastApi;
}

interface ToastLike {
  success: (msg: string) => unknown;
  error: (msg: string) => unknown;
}

/**
 * One-shot `?sync=…` importer — runs once on mount and reads the URL
 * import flag, then dispatches the success/error toast.
 *
 * `loadFromUrl` and `toast` are captured by ref so the effect stays
 * `[]`-deps without the `react-hooks/exhaustive-deps` suppress.
 */
export function useFinykSyncUrlImport({
  loadFromUrl,
  toast,
}: UseFinykSyncUrlImportArgs): void {
  const loadRef = useRef(loadFromUrl);
  loadRef.current = loadFromUrl;
  const toastRef = useRef<ToastLike>(toast);
  toastRef.current = toast as ToastLike;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.search.includes("sync=")) return;
    const ok = loadRef.current();
    if (ok) toastRef.current.success("Налаштування синхронізовано!");
    else toastRef.current.error("Не вдалось завантажити синк-дані");
  }, []);
}
