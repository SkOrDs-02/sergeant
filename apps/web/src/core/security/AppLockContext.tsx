import { createContext, useContext, type ReactNode } from "react";
import { useAppLock, type UseAppLockReturn } from "./useAppLock";

const AppLockContext = createContext<UseAppLockReturn | null>(null);

export function AppLockProvider({ children }: { children: ReactNode }) {
  const appLock = useAppLock();
  return (
    <AppLockContext.Provider value={appLock}>
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLockContext(): UseAppLockReturn {
  const ctx = useContext(AppLockContext);
  if (!ctx)
    throw new Error("useAppLockContext must be used inside AppLockProvider");
  return ctx;
}
