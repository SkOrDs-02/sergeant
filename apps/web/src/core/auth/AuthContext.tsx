import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser, apiQueryKeys } from "@sergeant/api-client/react";
import type { User } from "@sergeant/shared";
import {
  signIn,
  signUp,
  signOut,
  requestPasswordReset as requestPasswordResetApi,
} from "./authClient";
import { identifyPostHogUser, resetPostHog } from "../observability/posthog";
import { swClearCaches, swSetActiveUser } from "../app/swControl";
import { logger } from "@shared/lib";
import { buildIdentifyTraits } from "../observability/identifyTraits";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { clearDemoFlag } from "../onboarding/onboardingGate";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { reconcileChatOwnerOnAuthChange } from "../hub/hubChatSessions";
import { clearPersistedQueryCache } from "@shared/lib/api/queryClientPersister";
import { flushPendingSyncOpsBeforeLogout } from "../syncEngine/flushBeforeLogout";
import { SIGN_IN_PATH } from "../app/appPaths";
import { messages } from "../../shared/i18n/uk";
import {
  safeReadStringSS,
  safeWriteSS,
  safeRemoveSS,
  safeRemoveLS,
  webKVStore,
} from "@shared/lib/storage/storage";

/**
 * AI-DANGER: цей файл сидить у eager-графі найближче до analytics, і
 * НОВИЙ import `@sergeant/shared` саме звідси перекроює чанки так, що
 * analytics-модуль стартує з ще не ініціалізованими константами:
 * `Cannot read properties of undefined (reading 'SIGNUP_COMPLETED')`,
 * білий екран на бутi (browser-QA 2026-08-06). Типи (`import type`)
 * безпечні — вони стираються; ламає саме runtime-значення, і однаково
 * як статичним імпортом, так і `await import(...)` усередині `logout`.
 *
 * Тому ключ тут — літерал, а не `STORAGE_KEYS.SYNC_ORIGIN_DEVICE_ID`.
 * Синхрон із реєстром тримає `AuthContext.originDeviceKey.test.ts`.
 * Потрібне ще одне значення зі `@sergeant/shared`? Або продублюй так
 * само з pin-тестом, або спершу перевір буту у браузері на prod-білді —
 * typecheck і юніти цю поломку не бачать.
 */
const SYNC_ORIGIN_DEVICE_ID_KEY = "sync_origin_device_id_v1";

// WF-60 OAuth signup attribution — `signIn.social` full-page-redirects to the
// provider, so `loginWithGoogle`/`loginWithApple` never resolve on success and
// can't fire `SIGNUP_COMPLETED` themselves (see their JSDoc). We stash which
// provider button was pressed in sessionStorage right before the redirect —
// together with the timestamp of that redirect — then resolve signup-vs-login
// after the callback lands back on `/`: Better Auth stamps `createdAt` once, at
// row insert, so an account created no earlier than the redirect we just made
// is by definition an account this redirect created, while a repeat login's
// `createdAt` predates it by however long the account has existed. The flag is
// read-once (removed unconditionally) so a login that merely follows an
// earlier abandoned signup attempt can't misfire on a later real login.
const PENDING_OAUTH_PROVIDER_KEY = "sergeant.auth.pendingOAuthProvider";

// The account counts as created *by this redirect* if its `createdAt` is not
// older than the moment we left for the provider. Anchoring to the redirect
// start rather than to `Date.now()` keeps slow flows honest — 2FA, account
// chooser or a distracted user can stretch an OAuth round-trip well past any
// fixed "recent enough" window, and a missed signup here is exactly the
// undercount this whole fix exists to remove.
//
// The tolerance absorbs client/server clock skew only: `createdAt` is stamped
// by the server, the redirect timestamp by the browser. It is deliberately not
// a "recency" budget — widening it does not make a stale login look fresh,
// because a repeat login's account is older by days, not minutes.
const OAUTH_CLOCK_SKEW_TOLERANCE_MS = 10 * 60 * 1000;

function markPendingOAuthProvider(provider: "google" | "apple"): void {
  safeWriteSS(PENDING_OAUTH_PROVIDER_KEY, `${provider}:${Date.now()}`);
}

function consumePendingOAuthSignup(createdAt: string | null): void {
  const raw = safeReadStringSS(PENDING_OAUTH_PROVIDER_KEY);
  safeRemoveSS(PENDING_OAUTH_PROVIDER_KEY);
  if (!raw) return;

  const sep = raw.lastIndexOf(":");
  const provider = sep === -1 ? raw : raw.slice(0, sep);
  if (provider !== "google" && provider !== "apple") return;

  // Pre-timestamp flags (written by an older build still in a live tab) fall
  // back to "now" so an in-flight upgrade degrades to the previous behaviour
  // instead of dropping the event outright.
  const startedAtMs = sep === -1 ? Date.now() : Number(raw.slice(sep + 1));
  if (!Number.isFinite(startedAtMs)) return;

  if (!createdAt) return;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return;

  if (createdAtMs < startedAtMs - OAUTH_CLOCK_SKEW_TOLERANCE_MS) return;
  trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, { method: provider });
}

/**
 * AuthContext — єдине джерело правди «хто я» для веб-додатку.
 *
 * Дані про поточного користувача тягнемо через `useUser()` з
 * `@sergeant/api-client/react` (`GET /api/v1/me` + runtime-валідація
 * `MeResponseSchema`). Better Auth лишається тільки як actions-layer
 * (`signIn.email`, `signUp.email`, `signOut`, `requestPasswordReset`) — після
 * кожної дії інвалідуємо `apiQueryKeys.me.current()`, щоб наступний
 * рендер побачив свіжий профіль.
 */

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Translate auth errors to Ukrainian. Приймає або рядок (для catch-гілок,
 * де ми вже маємо тільки `err.message`), або частковий error-обʼєкт
 * (`{ code, message, error?, status? }`) — тоді мапимо насамперед за
 * Better Auth `code`, бо це стабільний контракт, на відміну від
 * англійських `message`, які регулярно ламали мапер (наприклад,
 * `/invalid email/i` фальш-метчив `"Invalid email or password"`, і юзер
 * з неправильним паролем бачив «Невірний формат email.»). Поле `error`
 * читаємо як fallback — наш серверний error-handler і rate-limiter
 * пишуть саме його, а не `message`, тож без цієї гілки 429/5xx
 * приходили б у фронт як `undefined` і ловилися зовнішнім fallback-ом.
 */
export type AuthErrorLike = {
  code?: string | null | undefined;
  message?: string | null | undefined;
  error?: string | null | undefined;
  status?: number | null | undefined;
  statusText?: string | null | undefined;
};

// AI-CONTEXT: error-code switch — every branch must round-trip the Better Auth
// `code`/`status` pair to a user-facing Ukrainian message. A typo in any case
// arm silently surfaces the English fallback or the raw vendor string.
export function translateAuthError(
  raw: AuthErrorLike | string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  if (typeof raw === "string") return translateByMessage(raw, fallback);

  const code = typeof raw.code === "string" ? raw.code : "";
  const status = typeof raw.status === "number" ? raw.status : 0;
  const message =
    (typeof raw.message === "string" && raw.message) ||
    (typeof raw.error === "string" && raw.error) ||
    "";

  // Status / serverний код мають пріоритет над англійським `message` —
  // 429 від нашого rate-limiter-а й 5xx від errorHandler-а не несуть
  // Better Auth-ового коду, тільки `code: "RATE_LIMIT" | "INTERNAL"`.
  if (status === 429 || code === "RATE_LIMIT") return messages.auth.rateLimited;
  if (status >= 500 || code === "INTERNAL") return messages.auth.serverDown;

  // Better Auth canonical error-codes — стабільніше за parsing message.
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return messages.auth.invalidEmailOrPassword;
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return messages.auth.userAlreadyExists;
    case "INVALID_EMAIL":
      return messages.auth.invalidEmail;
    case "INVALID_PASSWORD":
      return messages.auth.invalidPassword;
    case "PASSWORD_TOO_SHORT":
      return messages.auth.passwordTooShort;
    case "PASSWORD_TOO_LONG":
      return messages.auth.passwordTooLong;
    case "EMAIL_NOT_VERIFIED":
      return messages.auth.emailNotVerified;
    case "PROVIDER_NOT_FOUND":
      return messages.auth.providerNotFound;
    case "FAILED_TO_CREATE_SESSION":
    case "FAILED_TO_CREATE_USER":
      return messages.auth.sessionFailure;
    case "INVALID_TOKEN":
    case "TOKEN_EXPIRED":
      return messages.auth.invalidToken;
  }

  return translateByMessage(message, fallback);
}

function translateByMessage(message: string, fallback: string): string {
  if (!message) return fallback;
  // Better Auth повертає невалідний / прострочений reset-link як
  // `code: "INVALID_TOKEN"` + `message: "Invalid token"` (англ.).
  // На випадок, коли code не доїхав, ловимо message-level patern,
  // щоб не лишити англомовну "Invalid token" у UI.
  if (/^invalid token$/i.test(message)) return messages.auth.invalidToken;
  // Перевіряти specific-перед-generic: `"Invalid email or password"`
  // містить підрядок `"Invalid email"`, тож загальна гілка
  // `/invalid email/i` фальш-метчила wrong-password як «Невірний формат
  // email.». Тримаємо composite-патерн вище і використовуємо межу слова
  // у вузькій гілці.
  if (/user already exists/i.test(message))
    return messages.auth.userAlreadyExists;
  if (/invalid email or password/i.test(message))
    return messages.auth.invalidEmailOrPassword;
  if (/password too short/i.test(message))
    return messages.auth.passwordTooShort;
  if (/password too long/i.test(message)) return messages.auth.passwordTooLong;
  if (/^invalid email\b/i.test(message)) return messages.auth.invalidEmail;
  if (/invalid password/i.test(message)) return messages.auth.invalidPassword;
  return message || fallback;
}

/**
 * Витягує `{message, status, ...}` з невідомого `err` із catch-блоку, не
 * втрачаючи додаткових полів (`status`/`code`/`error`), які могли потрапити
 * до Error-обʼєкта (наприклад, з `BetterFetchError`). Повертає `null`
 * замість `{}`, щоб `translateAuthError` повернув свій fallback.
 */
function asAuthErrorLike(err: unknown): AuthErrorLike | null {
  if (err == null) return null;
  if (typeof err === "string") return { message: err };
  if (typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  return {
    message: typeof e["message"] === "string" ? e["message"] : null,
    error: typeof e["error"] === "string" ? e["error"] : null,
    code: typeof e["code"] === "string" ? e["code"] : null,
    status: typeof e["status"] === "number" ? e["status"] : null,
    statusText: typeof e["statusText"] === "string" ? e["statusText"] : null,
  };
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  status: AuthStatus;
  authError: string | null;
  setAuthError: (msg: string | null) => void;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  loginWithApple: () => Promise<boolean>;
  /**
   * `true` — акаунт створено; `"exists"` — email вже зареєстровано
   * (форма перемикається на login синхронно, без читання `authError`,
   * який на момент повернення ще stale); `false` — інша помилка.
   */
  register: (
    email: string,
    password: string,
    name: string,
  ) => Promise<boolean | "exists">;
  /**
   * Вихід із акаунта з повним локальним teardown (включно зі стиранням
   * локальної SQLite).
   *
   * Перед стиранням завжди намагається доставити чергу синхронізації —
   * автоматично, для БУДЬ-ЯКОГО викликача, щоб цей запобіжник не можна
   * було забути підключити (саме так помер `purgeSyncOpOutboxForUser`).
   *
   * `confirmUnsyncedLoss` — необовʼязковий гак для шляхів, де виходить
   * ЖИВА людина. Викликається лише тоді, коли після спроби доставки
   * щось лишилось недоставленим, і отримує кількість таких записів.
   * Поверни `false`, щоб СКАСУВАТИ вихід (нічого не буде стерто, сесія
   * лишиться живою). Без гака вихід іде далі — така поведінка була
   * завжди, і програмні шляхи (revoke сесії, demo-команди) на неї
   * розраховують.
   */
  logout: (options?: {
    confirmUnsyncedLoss?: (pending: number) => Promise<boolean>;
  }) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Derived hub bento snapshots. Flat, not keyed by user, so they must be
 * dropped on every identity change — including a UI logout, which
 * pre-stamps the chat owner and therefore bypasses the reconcile effect.
 */
const HUB_QUICK_STATS_KEYS = [
  "finyk_quick_stats",
  "fizruk_quick_stats",
  "routine_quick_stats",
  "nutrition_quick_stats",
] as const;

function clearHubQuickStatsSnapshots(): void {
  for (const key of HUB_QUICK_STATS_KEYS) safeRemoveLS(key);
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const meQuery = useUser({
    // 401 від `/api/v1/me` для анонімного візитера — нормальний стан,
    // а не «справжня» помилка: ми лишаємо `user = null` і рендеримо
    // sign-in surface. Тому не ретраїмо і не завалюємо UI спінером.
    retry: false,
  });

  // `signedOut` — явний маркер «сесію завершено цим табом», який має
  // пріоритет над кешем `me`.
  //
  // AI-DANGER: не заміняй його на «просто почистити кеш». `queryClient.clear()`
  // прибирає запис `me` зі сховища, але НЕ повідомляє вже змонтований
  // `useUser`-observer — той і далі віддає останню успішну відповідь. Через це
  // після виходу застосунок лишався «залогіненим»: хедер вітав попереднього
  // юзера, вкладка «Профіль» показувала його email, а редирект на `/sign-in`
  // відскакував назад на хаб, бо `renderStandaloneRoute` бачив непорожній
  // `user` (browser QA 2026-08-05, F-008). Прапорець робить перехід у
  // signed-out незалежним від внутрішньої механіки React Query.
  const [signedOut, setSignedOut] = useState(false);

  const user = signedOut ? null : (meQuery.data?.user ?? null);
  const isLoading = !signedOut && meQuery.isLoading;
  const status: AuthStatus = isLoading
    ? "loading"
    : user
      ? "authenticated"
      : "unauthenticated";

  // F12 privacy: історія HubChat лежить у плоских LS-ключах — при зміні
  // identity на цьому пристрої (logout, інший акаунт, протухла сесія)
  // її треба стерти, інакше наступний юзер читає чужі розмови. Ефект на
  // resolved identity ловить і UI-logout, і cookie-switch після reload.
  // Той самий сигнал чистить і quick-stats хаб-карток — вони теж плоскі
  // й показували числа попереднього акаунта поряд із новим імʼям
  // (браузерна верифікація 2026-08-06/07); модуль перезапише їх при
  // першому власному рендері.
  //
  // Identity-wipe (follow-up тієї ж верифікації): коли попередня
  // identity на пристрої була ІНШИМ залогіненим користувачем, мʼякої
  // чистки замало — module-фіди попередника живуть у React-Query кеші
  // (памʼять) та в persisted-снапшоті на диску (keyed by build-id, не
  // user-id), а module-scope singleton-и (booted-прапорці reader-ів,
  // dualwrite prev-снапшоти) тримають стан старої SQLite-партиції.
  // Тому: clear() → purge снапшота → повний reload у свіжу партицію.
  // `anon → user` навмисно НЕ тригерить teardown — інакше
  // anonymous-data migration не встигла б перенести локальні чернетки
  // в акаунт. UI-logout сюди теж не потрапляє: `logout()` стампить
  // owner ще до `setSignedOut`, і ефект бачить identity незмінною.
  useEffect(() => {
    if (status === "loading") return;
    const { changed, prevOwnerWasUser } = reconcileChatOwnerOnAuthChange(
      user?.id ?? null,
    );
    if (!changed) return;
    clearHubQuickStatsSnapshots();
    if (!prevOwnerWasUser) return;
    queryClient.clear();
    void clearPersistedQueryCache()
      .catch((err) => {
        logger.warn(
          "[auth.identityWipe] persisted RQ snapshot purge failed",
          err,
        );
      })
      .finally(() => {
        window.location.reload();
      });
  }, [status, user?.id, queryClient]);

  const [authError, setAuthError] = useState<string | null>(null);

  const invalidateMe = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: apiQueryKeys.me.current() }),
        // Tier is user-scoped: without this a `billing/status` snapshot
        // cached just before the session change (or its 401 collapsed to
        // "free" — usePlan has retry:false + staleTime 60s) survives the
        // login and shows a paying/trialing user the Free plan.
        queryClient.invalidateQueries({ queryKey: billingKeys.status }),
      ]),
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await invalidateMe();
  }, [invalidateMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      try {
        const result = await signIn.email({ email, password });
        if (result?.error) {
          setAuthError(translateAuthError(result.error, "Помилка входу"));
          return false;
        }
        // Leaving demo on auth prevents the demo+authenticated mixed state
        // that wedges the post-logout transition (QA D-004).
        clearDemoFlag();
        setSignedOut(false);
        await invalidateMe();
        return true;
      } catch (err) {
        setAuthError(translateAuthError(asAuthErrorLike(err), "Помилка входу"));
        return false;
      }
    },
    [invalidateMe],
  );

  // Better Auth `signIn.social` ініціює OAuth-редирект на провайдера —
  // у разі успіху сторінка переходить на Google і керування назад
  // повертається через `callbackURL`, тож resolve тут зазвичай не
  // настає. Помилки (provider не сконфігуровано на сервері, мережа,
  // CSRF) повертаються синхронно через `result.error` — піднімаємо їх
  // у `authError`, щоб користувач отримав фідбек замість мовчазного
  // нічого.
  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    markPendingOAuthProvider("google");
    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result?.error) {
        setAuthError(
          translateAuthError(result.error, "Не вдалося увійти через Google"),
        );
        return false;
      }
      return true;
    } catch (err) {
      setAuthError(
        translateAuthError(
          asAuthErrorLike(err),
          "Не вдалося увійти через Google",
        ),
      );
      return false;
    }
  }, []);

  // Apple Sign-In — initiative 0010 Phase 4.3. Mirrors `loginWithGoogle`:
  // `signIn.social` redirects to `appleid.apple.com`, browser посилає
  // form-post назад на `/api/auth/callback/apple`, далі сесія
  // встановлюється через cookie. `PROVIDER_NOT_FOUND` означає, що
  // server-side Apple env-и (`APPLE_CLIENT_ID` / `APPLE_TEAM_ID` /
  // `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY`) ще не задані — фронт показує
  // зрозуміле повідомлення з `messages.auth.providerNotFound`.
  const loginWithApple = useCallback(async () => {
    setAuthError(null);
    markPendingOAuthProvider("apple");
    try {
      const result = await signIn.social({
        provider: "apple",
        callbackURL: "/",
      });
      if (result?.error) {
        setAuthError(
          translateAuthError(result.error, "Не вдалося увійти через Apple"),
        );
        return false;
      }
      return true;
    } catch (err) {
      setAuthError(
        translateAuthError(
          asAuthErrorLike(err),
          "Не вдалося увійти через Apple",
        ),
      );
      return false;
    }
  }, []);

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setAuthError(null);
      try {
        const result = await signUp.email({ email, password, name });
        if (result?.error) {
          setAuthError(translateAuthError(result.error, "Помилка реєстрації"));
          const code = (result.error as { code?: string }).code;
          return code === "USER_ALREADY_EXISTS" ||
            code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
            ? "exists"
            : false;
        }
        // WF-60 growth funnel рахує цю подію як перехід
        // visit → signup. Fire-and-forget — `trackEvent` ловить власні
        // помилки і ніколи не кидає. Викликаємо до `invalidateMe`, щоб
        // ивент полетів навіть якщо рефетч `me` зависне.
        trackEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, { method: "email" });
        // Leaving demo on auth prevents the demo+authenticated mixed state
        // that wedges the post-logout transition (QA D-004).
        clearDemoFlag();
        setSignedOut(false);
        await invalidateMe();
        return true;
      } catch (err) {
        setAuthError(
          translateAuthError(asAuthErrorLike(err), "Помилка реєстрації"),
        );
        return false;
      }
    },
    [invalidateMe],
  );

  const logout = useCallback(
    async (options?: {
      confirmUnsyncedLoss?: (pending: number) => Promise<boolean>;
    }) => {
      // Це МУСИТЬ бути найпершим — до `setSignedOut`, до `signOut()`, до
      // будь-якого teardown. Далі по функції йде `wipeSqliteDb()`, який
      // видаляє файл локальної БД РАЗОМ із чергою синхронізації; поки
      // запис не доїхав до Postgres, локальна копія — єдина, що існує.
      // Скасувати вихід можна лише тут, поки нічого ще не зруйновано.
      const { pending, unknown } = await flushPendingSyncOpsBeforeLogout();
      if (!unknown && pending > 0 && options?.confirmUnsyncedLoss) {
        const proceed = await options.confirmUnsyncedLoss(pending);
        if (!proceed) return;
      }

      // Identity-wipe координація: стампимо owner ДО `setSignedOut`,
      // щоб reconcile-ефект вище побачив identity вже узгодженою і не
      // запустив другий teardown+reload поверх logout-івського — увесь
      // потрібний wipe (SW-кеші, SQLite-партиція, LS-слайси, RQ clear)
      // logout виконує сам нижче.
      reconcileChatOwnerOnAuthChange(null);
      // Той пре-стамп вище споживає зміну identity, тож reconcile-ефект
      // побачить `changed: false` і НЕ прибере hub-снапшоти сам — logout
      // мусить зробити це власноруч. Інакше вони переживають вихід, а
      // наступний вхід іде шляхом `anon → user`, який навмисно мʼякий
      // (щоб не зламати anonymous-data migration) і теж їх не чистить:
      // новий акаунт бачить на хабі числа попереднього, поки картки не
      // перерахуються. Модульні екрани при цьому коректні — партиція
      // SQLite своя (виміряно 2026-08-06: хаб 5 150 ₴ від попереднього
      // акаунта, `/finyk` того ж моменту — власні 4 420 ₴).
      clearHubQuickStatsSnapshots();

      // Перше і найголовніше: перемкнути UI у signed-out ще до мережі. Все
      // нижче — teardown, який не має права гейтити цей перехід (і історично
      // саме тому клали `clear()` першим — див. коментар нижче).
      setSignedOut(true);
      try {
        await signOut();
      } catch {
        // Ігноруємо: навіть якщо Better Auth endpoint повернув помилку,
        // далі все одно викидаємо локальний me-кеш — UI має показати
        // sign-in surface, а не застрягти в «напів-залогіненому» стані.
      }
      // Drop the whole in-memory query cache FIRST, before any of the
      // best-effort teardown below. Two reasons:
      //
      //   1. `invalidateMe()` alone only marks `me` stale and refetches — but the
      //      refetch 401s and React Query *retains* the last-good `me` payload on
      //      error, so `user` stayed populated and the UI stayed logged-in until a
      //      manual reload (browser-QA finding (a)). `clear()` викидає кеш
      //      користувача (і всі authed-query модулів) одразу, тож жоден екран не
      //      віддає дані попереднього юзера. Але сам по собі `clear()` НЕ
      //      перемикає `status` — змонтований `useUser`-observer не отримує
      //      нотифікації про видалення і далі тримає останню успішну відповідь.
      //      За перехід у `unauthenticated` відповідає `setSignedOut(true)` вище.
      //   2. Ordering is the safety net: this used to run LAST, so a single
      //      wedged step in between (SW `ready` never settling — see
      //      `swControl.ts :: SW_READY_TIMEOUT_MS`) left the server session
      //      destroyed while the UI kept rendering the signed-out user's profile
      //      and data, with no redirect (аудит 2026-08-04, знахідка 4). Clearing
      //      up-front makes the UI transition unconditional; everything below is
      //      cleanup that must never gate it.
      queryClient.clear();
      // Audit 03 / Decision #2 (C): wipe SW caches on logout so user B
      // never resolves a stale cache entry that belonged to user A on
      // shared devices. Fire-and-forget — ignore SW failures since the
      // partition plugin (`cacheKeyWillBeUsed`) is the in-flight defense.
      try {
        await swClearCaches();
      } catch (err) {
        logger.warn("[auth.logout] swClearCaches failed", err);
      }
      try {
        await swSetActiveUser(null);
      } catch (err) {
        logger.warn("[auth.logout] swSetActiveUser(null) failed", err);
      }
      // Audit 10 / F17: delete the just-signed-out user's local SQLite DB so
      // user B never reads user A's rows on a shared device, then reset the
      // partition to `anon` for any post-logout anonymous usage. Dynamic import
      // keeps the sqlite-wasm chunk lazy (see `sqlite.lazy.test.ts`).
      try {
        // Скидаємо origin-device-id ДО wipe, поки `kv_store` ще привʼязаний.
        // Сервер відсіює на pull операції, чий `origin_device_id` дорівнює
        // нашому — echo-suppression. Але id живе у `kv_store`, який не
        // user-scoped, тож `wipeSqliteDb()` його не чіпає: пристрій лишався
        // «тим самим», і власні рядки, які він же і запушив, більше НІКОЛИ
        // не поверталися після того, як logout стер локальну копію.
        // Виміряно 2026-08-06: акаунт із рядком на сервері входить назад на
        // цей пристрій і бачить порожній Фінік, бо його єдина операція має
        // origin цього ж пристрою. Свіжий id = pull віддає все своє.
        await webKVStore.remove(SYNC_ORIGIN_DEVICE_ID_KEY);
      } catch (err) {
        logger.warn("[auth.logout] origin-device-id reset failed", err);
      }
      try {
        const sqliteMod = await import("../db/sqlite");
        await sqliteMod.wipeSqliteDb();
        sqliteMod.setSqliteUser(null);
      } catch (err) {
        logger.warn("[auth.logout] sqlite wipe/reset failed", err);
      }
      // Browser-QA 2026-06-15: logout used to leave the previous user's
      // local-first data behind (plaintext `finyk_tx_cache`, `nutrition_water_v1`,
      // the `kvvfs-*` SQLite store, the RQ persister snapshot, and the in-memory
      // warm cache) — all readable by the next user on a shared device. Purge the
      // app-owned slices of every physical store. Allowlist-scoped, so foreign
      // keys (PostHog/Sentry) are never touched. Dynamic import keeps the helper
      // (and its kv/idb deps) out of the eager auth chunk.
      try {
        const { purgeAppOwnedLocalData } =
          await import("../../shared/lib/storage/purgeLocalData");
        await purgeAppOwnedLocalData();
      } catch (err) {
        logger.warn("[auth.logout] local-first data purge failed", err);
      }
      // Second `clear()`: the teardown above is async, so a query that was
      // already in flight when the first clear ran can land afterwards and
      // repopulate the cache. Cheap and idempotent.
      queryClient.clear();

      // Останнім — повний reload. Усе вище чистить сховища, але НЕ
      // module-scope singleton-и: теплі SQLite-read-кеші модулів,
      // `booted`-прапорці boot-ів, лічильники поколінь reader-ів. Вони
      // живуть у памʼяті JS-модуля і переживають logout, тому наступний
      // вхід іншим акаунтом бачив числа попереднього: quick-stats-boot
      // рахував снапшот хаба з кешу старої партиції і переписував ним
      // щойно очищені ключі (виміряно 2026-08-06 — хаб 4 420 ₴ від
      // попереднього акаунта під сесією наступного). Identity-wipe-ефект
      // сюди не дістає: `logout()` навмисно стампить owner заздалегідь,
      // щоб не було двох teardown-ів, — тож reload має зробити logout.
      // Той самий механізм, що вже прийнятий для user → user switch.
      //
      // `assign(SIGN_IN_PATH)`, а не `reload()`: teardown щойно вичистив і
      // onboarding-прапорці, тож перезавантаження поточного маршруту
      // висаджує щойно розлогіненого користувача на `/welcome` — пройти
      // онбординг заново замість того, щоб просто увійти.
      try {
        globalThis.location?.assign(SIGN_IN_PATH);
      } catch (err) {
        // jsdom (`Not implemented: navigation`) і будь-який headless-раннер.
        // Logout уже завершений — reload лише прибирає залишковий стан.
        logger.warn("[auth.logout] reload after teardown failed", err);
      }
    },
    [queryClient],
  );

  // Привʼязуємо/відвʼязуємо аналітику до userId. Ref тримає попередній
  // userId, щоб `reset()` викликався тільки на реальному переході
  // authenticated → unauthenticated, а не при першому mount з `null`.
  // Traits (vibe / plan / locale / signup_date) збираються у
  // `buildIdentifyTraits()` — див. JSDoc у `identifyTraits.ts` про
  // джерела і поведінку при відсутності localStorage / navigator.
  const lastIdentifiedUserIdRef = useRef<string | null>(null);
  const userRef = useRef(user);
  useLayoutEffect(() => {
    userRef.current = user;
  });
  // AI-DANGER: auth-state transition effect. Calls `identifyPostHogUser` on
  // every login and `resetPostHog` on every logout. Wrong wiring here either
  // attributes one user's analytics events to another (privacy leak) or
  // silently stops identifying entirely. Pair changes here with a test of
  // the login → logout → re-login sequence on `lastIdentifiedUserIdRef`.
  useEffect(() => {
    const currentId = user?.id ?? null;
    const prevId = lastIdentifiedUserIdRef.current;
    const sessionUser = userRef.current;
    if (currentId && sessionUser && currentId !== prevId) {
      // WF-60: resolve any pending OAuth signup attribution now that `me`
      // has resolved post-redirect — see `consumePendingOAuthSignup` JSDoc.
      consumePendingOAuthSignup(sessionUser.createdAt ?? null);
      // `IdentifyTraits` має index-signature `[key: string]: unknown`,
      // тому присвоюється до `Record<string, unknown>` без касту.
      // Типи трейтів захищає сам `buildIdentifyTraits`.
      identifyPostHogUser(currentId, buildIdentifyTraits(sessionUser));
      lastIdentifiedUserIdRef.current = currentId;
      // Audit 03 / Decision #2 (C): partition SW cache keys per user.
      // Fire-and-forget; SW restart will fall back to `__u=anon` until
      // next mount re-posts.
      void swSetActiveUser(currentId).catch((err) =>
        logger.warn("[auth.identify] swSetActiveUser failed", err),
      );
      // SQLite partition selection and reader boot are owned by
      // AnonymousDataMigrationProvider. Switching here would race the
      // local-anon snapshot on the first authenticated render.
    } else if (!currentId && prevId) {
      resetPostHog();
      lastIdentifiedUserIdRef.current = null;
    }
    // `user` навмисно НЕ в deps: traits, які залежать від `user`
    // (signup_date), стабільні на час життя ідентифікованої сесії, а
    // решта (vibe / plan / locale) тягнеться з зовнішніх джерел —
    // localStorage і `navigator`. Перезапуск ефекту на кожен новий
    // `user`-референс (наприклад, після refetch `/api/v1/me`)
    // спричинив би зайві identify-виклики при тому самому id.
    // `userRef` дає свіжі traits лише на переході id.
  }, [user?.id]);

  // Request a password reset email via Better Auth. Returns `true` when
  // the request was accepted (the server still answers OK even if the
  // address isn't registered — we don't leak account enumeration). The
  // UI uses that flag to show a neutral "check your inbox" state.
  const requestPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const result = await requestPasswordResetApi({ email, redirectTo });
      if (result?.error) {
        setAuthError(
          translateAuthError(
            result.error,
            "Не вдалося надіслати лист для скидання.",
          ),
        );
        return false;
      }
      return true;
    } catch (err) {
      setAuthError(
        translateAuthError(
          asAuthErrorLike(err),
          "Не вдалося надіслати лист для скидання.",
        ),
      );
      return false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      status,
      authError,
      setAuthError,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      requestPasswordReset,
      refresh,
    }),
    [
      user,
      isLoading,
      status,
      authError,
      login,
      loginWithGoogle,
      loginWithApple,
      register,
      logout,
      requestPasswordReset,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/**
 * Non-throwing variant of {@link useAuth} — `null` when rendered outside
 * `AuthProvider` instead of throwing.
 *
 * For shared hooks that are consumed BOTH by screens deep inside the
 * authenticated app shell AND by narrower call-sites that don't need the
 * full provider tree (e.g. a unit test rendering a single presentational
 * component, or a future non-authenticated embed). `useBiometrics`
 * (`core/profile/useBiometrics.ts`) is the first consumer: it only needs
 * `user?.id` to decide whether to fire the `/api/me/profile` write-through
 * push, and must not force every existing consumer of the hook to be
 * wrapped in `AuthProvider` just to read a local biometrics cache.
 */
export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
