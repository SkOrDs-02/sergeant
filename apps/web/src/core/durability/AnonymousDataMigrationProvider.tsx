/**
 * Last validated: 2026-07-28
 * Status: Active
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n";

import { useAuth } from "../auth/AuthContext";
import { migrateAnonymousDataToProfile } from "./anonymousDataMigration.js";

interface MigrationGateValue {
  readonly isReady: boolean;
}

const MigrationGateContext = createContext<MigrationGateValue>({
  isReady: true,
});
const inFlightByUser = new Map<string, Promise<{ migratedRows: number }>>();
const successToastUsers = new Set<string>();

function runSingleFlight(userId: string): Promise<{ migratedRows: number }> {
  const existing = inFlightByUser.get(userId);
  if (existing) return existing;
  const run = migrateAnonymousDataToProfile(userId).finally(() => {
    inFlightByUser.delete(userId);
  });
  inFlightByUser.set(userId, run);
  return run;
}

export function AnonymousDataMigrationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, status } = useAuth();
  if (status !== "authenticated" || !user?.id) {
    return (
      <MigrationGateContext.Provider value={{ isReady: true }}>
        {children}
      </MigrationGateContext.Provider>
    );
  }
  return (
    <AuthenticatedMigrationGate key={user.id} userId={user.id}>
      {children}
    </AuthenticatedMigrationGate>
  );
}

function AuthenticatedMigrationGate({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string;
}) {
  const { success } = useToast();
  const [state, setState] = useState<"running" | "ready" | "failed">("running");

  const run = useCallback(() => {
    setState("running");
    void runSingleFlight(userId)
      .then(async (result) => {
        const { bootSyncEngineReader } =
          await import("../syncEngine/singleton.js");
        await bootSyncEngineReader();
        setState("ready");
        if (result.migratedRows > 0 && !successToastUsers.has(userId)) {
          successToastUsers.add(userId);
          success(messages.sync.anonymousMigrationSuccess);
        }
      })
      .catch(() => setState("failed"));
  }, [success, userId]);

  useEffect(() => {
    void runSingleFlight(userId)
      .then(async (result) => {
        const { bootSyncEngineReader } =
          await import("../syncEngine/singleton.js");
        await bootSyncEngineReader();
        setState("ready");
        if (result.migratedRows > 0 && !successToastUsers.has(userId)) {
          successToastUsers.add(userId);
          success(messages.sync.anonymousMigrationSuccess);
        }
      })
      .catch(() => setState("failed"));
  }, [success, userId]);

  const isReady = state === "ready";
  const value = useMemo(() => ({ isReady }), [isReady]);

  if (!isReady) {
    return (
      <MigrationGateContext.Provider value={value}>
        <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
            {state === "failed" ? (
              <>
                <p
                  className="mb-5 text-sm leading-6 text-muted-foreground"
                  role="alert"
                >
                  {messages.sync.anonymousMigrationFailure}
                </p>
                <Button onClick={run}>
                  {messages.sync.anonymousMigrationRetry}
                </Button>
              </>
            ) : (
              <p
                className="text-sm leading-6 text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {messages.sync.anonymousMigrationProgress}
              </p>
            )}
          </section>
        </main>
      </MigrationGateContext.Provider>
    );
  }

  return (
    <MigrationGateContext.Provider value={value}>
      {children}
    </MigrationGateContext.Provider>
  );
}

export function useAnonymousDataMigrationReady(): boolean {
  return useContext(MigrationGateContext).isReady;
}

/** Test-only. */
export function __resetAnonymousMigrationSingleFlightForTests(): void {
  inFlightByUser.clear();
  successToastUsers.clear();
}
