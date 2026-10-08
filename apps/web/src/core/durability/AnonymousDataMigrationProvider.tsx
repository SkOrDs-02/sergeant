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
// AI-DANGER: `@shared/i18n` (index) тягне uk-каталог І en-копію — а це
// eager-поверхня. Беремо вузьке ядро; гейт — `uk.core.eagerImports.test.ts`.
import { coreMessages as messages } from "@shared/i18n/uk.core";
import {
  safeReadStringLSDurable,
  safeWriteStringLSDurable,
} from "@shared/lib/storage/storage";

import { captureException } from "../observability/sentry";
import {
  classifyTickError,
  readOnlineStatus,
} from "../syncEngine/tickErrorReport";

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

interface MigrationRun {
  promise: Promise<{ migratedRows: number }>;
  /** Розвідка вже знайшла рядки — перенос справді триває. */
  transferring: boolean;
  /** Підписники, що чекають на перехід у фазу переносу. */
  readonly listeners: Set<() => void>;
}

const inFlightByUser = new Map<string, MigrationRun>();
const successToastUsers = new Set<string>();

/**
 * Скільки тримати екран порожнім, поки триває розвідка.
 *
 * AI-CONTEXT: гейт монтується на КОЖНОМУ старті авторизованої сесії, і до
 * цієї правки повноекранне «Переносимо дані в профіль…» показувалось увесь
 * час роботи `migrateAnonymousDataToProfile` — включно з випадком, коли
 * переносити нема чого взагалі (`snapshot.length === 0`). А це не миттєво:
 * перемикання партиції SQLite, міграції схем чотирьох модулів і скан усіх
 * таблиць. Тобто на кожному перезавантаженні (у тому числі автоматичному з
 * `chunkReload`) користувач бачив тривожний текст про перенесення даних без
 * жодного перенесення. Рендер дітей при цьому лишається заблокованим: під
 * час розвідки активна партиція перемкнута на анонімну, і читання модулів у
 * цю мить бачило б чужі дані.
 *
 * AI-CONTEXT: grace лише відкладає панель, але не вирішує, ЩО в ній написано.
 * Якщо розвідка не вклалась у {@link PROBE_GRACE_MS} (на новому пристрої це
 * 5-13 с: міграції схем чотирьох модулів і скан таблиць), панель з'являється
 * без `onTransferStart`, тобто рядків для переносу ще не знайдено, а можливо
 * й нема зовсім. Тому в цьому стані текст нейтральний («Завантаження…»), а
 * «Переношу дані в профіль…» показується лише після `transferring === true`.
 * Інакше ми знову брехали б про перенос, якого немає (аудит 2026-10-01, ux-01).
 * Сам гейт і розвідка лишаються: блокування рендеру навмисне.
 */
export const PROBE_GRACE_MS = 500;

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
 *
 * AI-DANGER: саме `*LSDurable`, не `safeWriteLS`. Звичайний шлях після
 * `bootstrapKvStore()` резолвиться у SQLite-кеш, а запис назад у базу —
 * fire-and-forget; людина, яка тисне «перенесу пізніше» і одразу йде далі,
 * перезавантажує сторінку швидше, ніж той upsert долітає. Прод 2026-09-21:
 * рішення не переживало жодного переходу, і користувач із впалим переносом
 * упирався в блокуючий екран знову й знову — тобто НЕ МІГ користуватись
 * застосунком, щойно залогінившись. Durable-пара синхронно дзеркалить
 * значення в localStorage, звідки бут його й перечитує.
 */
function deferralKey(userId: string): string {
  return `hub_anon_migration_deferred_v1:${userId}`;
}

/**
 * Короткий технічний код збою для екрана: крок + причина без даних рядків.
 *
 * Перевірка структурна, а не `instanceof`: помилку кидає модуль, який
 * приїжджає окремим чанком, а тести підміняють його цілком — на такій межі
 * порівняння конструкторів ламається тихо й віддає `null` там, де діагноз
 * якраз і потрібен. Повний `message` (крок + `[vfs=… disk=…]`) від цього не
 * страждає: він їде в Sentry незалежно.
 */
function migrationFailureDetail(error: unknown): string {
  const shape =
    typeof error === "object" && error !== null
      ? (error as { name?: unknown; detail?: unknown; step?: unknown })
      : null;
  const name =
    typeof shape?.name === "string" && shape.name.length > 0
      ? shape.name
      : error instanceof Error
        ? error.name
        : "";
  if (name !== "AnonymousMigrationStepError") {
    return `unknown: ${name || typeof error}`;
  }
  const { detail, step } = shape ?? {};
  const safeStep =
    typeof step === "string" && step.trim().length > 0
      ? step.trim()
      : "unknown";
  const safeDetail =
    typeof detail === "string" && detail.trim().length > 0
      ? detail.trim()
      : "unknown";
  return `${safeStep}: ${safeDetail}`.slice(0, 240);
}

function readDeferred(userId: string): boolean {
  return safeReadStringLSDurable(deferralKey(userId)) === "1";
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

function runSingleFlight(
  userId: string,
  onTransferStart?: () => void,
): Promise<{ migratedRows: number }> {
  const existing = inFlightByUser.get(userId);
  if (existing) {
    // Прогін уже йде (StrictMode-подвійний маунт, повторний рендер). Або
    // одразу віддаємо факт, або підписуємось на нього.
    if (onTransferStart) {
      if (existing.transferring) onTransferStart();
      else existing.listeners.add(onTransferStart);
    }
    return existing.promise;
  }
  const run: MigrationRun = {
    promise: Promise.resolve({ migratedRows: 0 }),
    transferring: false,
    listeners: new Set(onTransferStart ? [onTransferStart] : []),
  };
  run.promise = migrateAnonymousDataToProfile(userId, {
    onTransferStart: () => {
      run.transferring = true;
      for (const listener of run.listeners) listener();
      run.listeners.clear();
    },
  }).finally(() => {
    inFlightByUser.delete(userId);
  });
  inFlightByUser.set(userId, run);
  return run.promise;
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
  /**
   * `offline` — браузер сам сказав, що інтерфейсу немає, і текст помилки
   * транспортний. Це не той самий випадок, що «перенос зламався»: користувач
   * на LTE у метро отримував тривожну плашку про незахищені дані там, де
   * чесна відповідь — «немає звʼязку, повторю пізніше».
   */
  const [failureKind, setFailureKind] = useState<"offline" | "generic">(
    "generic",
  );
  /**
   * Технічний код збою — прямо на екрані, дрібним.
   *
   * AI-CONTEXT: звіт власника 2026-09-13 прийшов трьома скріншотами ОДНОГО
   * й того самого тексту. Sentry тут не заміна: людина фотографує екран і
   * шле фото, а не лізе в дашборд, тож діагноз має бути в кадрі. Сюди йде
   * `detail` — сама причина, без службового префікса кроку й без
   * `[vfs=… disk=…]`: те й те адресоване нам, не людині, і в Sentry їде
   * повним `message` (звіт власника 2026-09-21). Ані вмісту рядків, ані
   * ідентифікаторів користувача тут немає й не має бути.
   */
  const [failureCode, setFailureCode] = useState<string | null>(null);
  const [deferred, setDeferred] = useState(() => readDeferred(userId));
  const [transferring, setTransferring] = useState(false);
  const [probeGraceElapsed, setProbeGraceElapsed] = useState(false);

  // Свідомо БЕЗ синхронного setState — інакше `react-hooks/set-state-in-effect`
  // ловить каскадний ререндер на маунті. Початковий стан уже `"running"`, тож
  // ефекту досить просто запустити роботу; перехід у `"running"` потрібен лише
  // на повторі, і живе він у `retry`.
  const kickoff = useCallback(() => {
    void runSingleFlight(userId, () => setTransferring(true))
      .then((result) => {
        setState("ready");
        if (result.migratedRows > 0 && !successToastUsers.has(userId)) {
          successToastUsers.add(userId);
          success(messages.sync.anonymousMigrationSuccess);
        }
      })
      .catch((error: unknown) => {
        // AI-CONTEXT: до 2026-09-13 тут стояв голий `.catch(() => …)` —
        // провал переносу не їхав ні в Sentry, ні в консоль, тож звіт
        // власника «проблема з перенесенням якась» неможливо було
        // діагностувати: у нас нема жодного поля про те, на якому кроці і
        // з чим саме воно впало. Класифікацію беремо ту саму, що й
        // sync-тіки (`tickErrorReport`), щоб офлайн-шум не залив issue.
        const online = readOnlineStatus();
        const verdict = classifyTickError(
          error,
          "anonymous-profile-migration",
          online,
        );
        setFailureKind(verdict.report ? "generic" : "offline");
        setFailureCode(migrationFailureDetail(error));
        if (verdict.report) {
          captureException(error, { extra: verdict.context });
        }
        setState("failed");
      })
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

  // Страховка на випадок повільної розвідки: якщо вона не вклалась у
  // {@link PROBE_GRACE_MS}, показуємо панель, щоб порожній екран не виглядав
  // як зависання. Швидкий шлях (переносити нема чого) до цього не доходить.
  useEffect(() => {
    const timer = setTimeout(() => setProbeGraceElapsed(true), PROBE_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const retry = useCallback(() => {
    setState("running");
    setFailureKind("generic");
    setFailureCode(null);
    kickoff();
  }, [kickoff]);

  const defer = useCallback(() => {
    safeWriteStringLSDurable(deferralKey(userId), "1");
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

  // Панель показуємо, лише коли є що сказати: почався справжній перенос, він
  // впав, або розвідка затягнулась понад {@link PROBE_GRACE_MS}. Доти рендер
  // дітей так само заблоковано — просто порожнім полотном кольору фону,
  // невідмінним від звичайного буту застосунку.
  const showProgressPanel =
    transferring || state === "failed" || probeGraceElapsed;

  if (!isReady && blocking && !deferred && !showProgressPanel) {
    return (
      <MigrationGateContext.Provider value={value}>
        <div className="min-h-screen bg-bg" aria-hidden="true" />
      </MigrationGateContext.Provider>
    );
  }

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
                  {failureKind === "offline"
                    ? messages.sync.anonymousMigrationFailureOffline
                    : messages.sync.anonymousMigrationFailure}
                </p>
                {failureCode !== null && (
                  <p className="mb-5 break-all text-style-caption text-muted">
                    {failureCode}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  <Button onClick={retry}>
                    {messages.sync.anonymousMigrationRetry}
                  </Button>
                  <Button variant="outline" onClick={defer}>
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
                {transferring
                  ? messages.sync.anonymousMigrationProgress
                  : messages.status.loading}
              </p>
            )}
          </section>
        </main>
      </MigrationGateContext.Provider>
    );
  }

  if (!showDeferredNotice) {
    return (
      <MigrationGateContext.Provider value={value}>
        {children}
      </MigrationGateContext.Provider>
    );
  }

  return (
    <MigrationGateContext.Provider value={value}>
      {/*
        AI-DANGER: плашка мусить жити у flex-колонці, а не просто «перед
        дітьми». `#root` має `height: 100dvh` (у standalone — `100vh`) і
        `overflow: hidden` (`styles/base.css`), а shell застосунку —
        `h-app-dvh`, тобто `height: 100%` ВІД цього ж рута. Простий сусід
        зверху зсовував shell рівно на свою висоту, і нижній навбар
        виїжджав за обрізаний край рута: юзер бачив плашку і застосунок без
        навігації (звіт власника 2026-09-13, скріншот PWA). Тут `flex-1
        min-h-0` віддає shell рівно залишок висоти, а `shrink-0` не дає
        плашці стиснутись у нечитабельний рядок.

        Інсет верху дописаний у `pt-[calc(...)]`, а не окремою утилітою
        `safe-area-pt`: обидві пишуть `padding-top` в одному шарі, і хто
        переможе, вирішував би порядок правил у згенерованому CSS, а не
        намір. Це друга половина того самого звіту: рут починається
        під статус-баром, тож текст плашки заїжджав під динамічний острів.
        Падінг (а не `top`) тягне фон `bg-warning-soft` у смугу інсету, і
        під островом лишається колір плашки, а не порожнеча.
      */}
      <div className="flex h-full flex-col overflow-hidden">
        <div
          role="status"
          className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-warning-soft px-4 pb-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] text-center text-style-body text-warning-soft-fg"
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
        <div className="min-h-0 flex-1">{children}</div>
      </div>
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
