/**
 * Last validated: 2026-08-01
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
import { useLocation } from "react-router-dom";

import { Button } from "@shared/components/ui/Button";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

import {
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
  STATUS_PATH,
} from "../app/appPaths";
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

/**
 * Маршрути, які не читають і не пишуть дані профілю. Юридичні тексти й
 * публічний статус мають лишатись доступними за будь-якого стану синку —
 * інакше збій переносу ховає від користувача Політику приватності, яку ми
 * зобовʼязані показувати. Перенос на цих сторінках усе одно триває у фоні,
 * просто не блокує рендер.
 */
const GATE_EXEMPT_PATHS: ReadonlySet<string> = new Set([
  LEGAL_PRIVACY_PATH,
  LEGAL_TERMS_PATH,
  LEGAL_COOKIES_PATH,
  LEGAL_OFFER_PATH,
  STATUS_PATH,
]);

/**
 * Рішення «перенесу пізніше» переживає перезавантаження — інакше кожен старт
 * застосунку знову замикав би користувача тим самим екраном.
 */
function deferralKey(userId: string): string {
  return `hub_anon_migration_deferred_v1:${userId}`;
}

function readDeferred(userId: string): boolean {
  return safeReadStringLS(deferralKey(userId)) === "1";
}

/**
 * Піднімає обидва sync-runtime для автентифікованого юзера — незалежно від
 * того, чим скінчився перенос анонімних даних.
 *
 * AI-DANGER: не переносити назад у success-гілку `kickoff`. Історія обох
 * дір (browser QA 2026-08-04, Obs-009):
 *
 *   - **reader** підіймався ЛИШЕ в `.then()` переносу. Якщо
 *     `migrateAnonymousDataToProfile` падав, reader не стартував узагалі, а
 *     «Перенести пізніше» лише ховає блокуючий екран — сесія тихо жила без
 *     жодного `pull`, тобто зміни з інших пристроїв не приїжджали.
 *   - **writer** мав єдиний call-site у самому переносі, ще й ПІСЛЯ раннього
 *     `return` для `snapshot.length === 0`. Тому вхід на пристрої без
 *     анонімних даних (звичайний вхід на новому девайсі) не стартував
 *     writer, і `sync_op_outbox` — куди пише кожен модульний sqliteWriter —
 *     не дренився всю сесію.
 *
 * `switchSqliteUser` тут обовʼязковий і має бути ПЕРЕД boot-ом: якщо перенос
 * впав посеред cleanup-фази, активна партиція могла лишитись анонімною, а
 * runtime резолвить клієнта на кожному тіку — тоді серверні рядки юзера
 * лягли б у анонімну базу. Виклик ідемпотентний (early-return на тому ж
 * ключі), тож на успішному шляху це no-op.
 */
async function bootSyncForUser(userId: string): Promise<void> {
  try {
    const sqlite = await import("../db/sqlite.js");
    await sqlite.switchSqliteUser(userId);
    const sync = await import("../syncEngine/singleton.js");
    await Promise.all([
      sync.bootSyncEngineReader(),
      sync.bootSyncEngineWriter(),
    ]);
  } catch {
    // Обидва boot-и мають власний catch-all із Sentry-репортом; сюди долітає
    // хіба збій `switchSqliteUser`. Ковтаємо: ми у `finally`, і неспійманий
    // reject тут зламав би гейт, який щойно відпрацював коректно.
  }
}

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
  const { pathname } = useLocation();
  if (status !== "authenticated" || !user?.id) {
    return (
      <MigrationGateContext.Provider value={{ isReady: true }}>
        {children}
      </MigrationGateContext.Provider>
    );
  }
  return (
    <AuthenticatedMigrationGate
      key={user.id}
      userId={user.id}
      blocking={!GATE_EXEMPT_PATHS.has(pathname)}
    >
      {children}
    </AuthenticatedMigrationGate>
  );
}

function AuthenticatedMigrationGate({
  children,
  userId,
  blocking,
}: {
  children: ReactNode;
  userId: string;
  blocking: boolean;
}) {
  const { success, warning } = useToast();
  const [state, setState] = useState<"running" | "ready" | "failed">("running");
  const [deferred, setDeferred] = useState(() => readDeferred(userId));

  // Свідомо БЕЗ синхронного setState — інакше `react-hooks/set-state-in-effect`
  // ловить каскадний ререндер на маунті. Початковий стан уже `"running"`, тож
  // ефекту досить просто запустити роботу; перехід у `"running"` потрібен лише
  // на повторі, і живе він у `retry`.
  const kickoff = useCallback(() => {
    void runSingleFlight(userId)
      .then((result) => {
        setState("ready");
        if (result.migratedRows > 0 && !successToastUsers.has(userId)) {
          successToastUsers.add(userId);
          success(messages.sync.anonymousMigrationSuccess);
        }
      })
      .catch(() => setState("failed"))
      // Синк піднімаємо в `finally`, а не в success-гілці: він потрібен і
      // після провалу переносу (юзер лишається в акаунті й натисне
      // «Перенести пізніше»), і на чистому пристрої, де переносити нічого.
      // Гейт більше не чекає на boot — «ready» означає «перенос завершено»,
      // а не «синк прогрітий».
      .finally(() => {
        void bootSyncForUser(userId);
      });
  }, [success, userId]);

  useEffect(() => {
    kickoff();
  }, [kickoff]);

  const retry = useCallback(() => {
    setState("running");
    kickoff();
  }, [kickoff]);

  const defer = useCallback(() => {
    safeWriteLS(deferralKey(userId), "1");
    setDeferred(true);
    warning(messages.sync.anonymousMigrationDeferredToast);
  }, [userId, warning]);

  const retryNow = useCallback(() => {
    setDeferred(false);
    retry();
  }, [retry]);

  const isReady = state === "ready";
  const value = useMemo(() => ({ isReady }), [isReady]);

  // Перенос ще не завершено, але користувач попросив пустити його далі (або
  // маршрут узагалі не потребує профільних даних). Показуємо тонку смугу
  // замість повного екрана: застосунок працює, а факт «дані ще не в профілі»
  // лишається на очах, поки не зникне сам.
  const showDeferredNotice = !isReady && (deferred || !blocking);

  if (!isReady && blocking && !deferred) {
    return (
      <MigrationGateContext.Provider value={value}>
        <main className="flex min-h-screen items-center justify-center bg-bg px-6 text-text">
          <section className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center shadow-e1">
            {state === "failed" ? (
              <>
                <p
                  className="mb-5 text-style-body leading-relaxed text-muted"
                  role="alert"
                >
                  {messages.sync.anonymousMigrationFailure}
                </p>
                <div className="flex flex-col gap-2">
                  <Button onClick={retry}>
                    {messages.sync.anonymousMigrationRetry}
                  </Button>
                  <Button variant="secondary" onClick={defer}>
                    {messages.sync.anonymousMigrationDefer}
                  </Button>
                </div>
              </>
            ) : (
              <p
                className="text-style-body leading-relaxed text-muted"
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
      {showDeferredNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-center text-style-caption text-warning-soft-fg"
        >
          <span>{messages.sync.anonymousMigrationDeferredNotice}</span>
          <button
            type="button"
            onClick={retryNow}
            className="rounded underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
          >
            {messages.sync.anonymousMigrationDeferredRetry}
          </button>
        </div>
      )}
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
