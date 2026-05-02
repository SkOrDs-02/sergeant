import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUser, apiQueryKeys } from "@sergeant/api-client/react";
import type { User } from "@sergeant/shared";
import { signIn, signUp, signOut, forgetPassword } from "./authClient";
import { identifyPostHogUser, resetPostHog } from "../observability/posthog";
import { buildIdentifyTraits } from "../observability/identifyTraits";

/**
 * AuthContext — єдине джерело правди «хто я» для веб-додатку.
 *
 * Дані про поточного користувача тягнемо через `useUser()` з
 * `@sergeant/api-client/react` (`GET /api/v1/me` + runtime-валідація
 * `MeResponseSchema`). Better Auth лишається тільки як actions-layer
 * (`signIn.email`, `signUp.email`, `signOut`, `forgetPassword`) — після
 * кожної дії інвалідуємо `apiQueryKeys.me.current()`, щоб наступний
 * рендер побачив свіжий профіль.
 */

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Translate auth errors to Ukrainian. Приймає або рядок (для catch-гілок,
 * де ми вже маємо тільки `err.message`), або частковий error-об'єкт
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
  code?: string | null;
  message?: string | null;
  error?: string | null;
  status?: number | null;
  statusText?: string | null;
};

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
  if (status === 429 || code === "RATE_LIMIT")
    return "Забагато спроб. Зачекай хвилину і спробуй ще раз.";
  if (status >= 500 || code === "INTERNAL")
    return "Сервер тимчасово недоступний. Спробуй пізніше.";

  // Better Auth canonical error-codes — стабільніше за parsing message.
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "Невірний email або пароль.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Цей email вже зареєстровано. Спробуй увійти.";
    case "INVALID_EMAIL":
      return "Невірний формат email.";
    case "INVALID_PASSWORD":
      return "Невірний пароль.";
    case "PASSWORD_TOO_SHORT":
      return "Пароль занадто короткий.";
    case "PASSWORD_TOO_LONG":
      return "Пароль занадто довгий.";
    case "EMAIL_NOT_VERIFIED":
      return "Email ще не підтверджено. Перевір пошту.";
    case "PROVIDER_NOT_FOUND":
      return "Цей провайдер входу не налаштовано.";
    case "FAILED_TO_CREATE_SESSION":
    case "FAILED_TO_CREATE_USER":
      return "Не вдалося завершити вхід. Спробуй ще раз.";
  }

  return translateByMessage(message, fallback);
}

function translateByMessage(message: string, fallback: string): string {
  if (!message) return fallback;
  // Перевіряти specific-перед-generic: `"Invalid email or password"`
  // містить підрядок `"Invalid email"`, тож загальна гілка
  // `/invalid email/i` фальш-метчила wrong-password як «Невірний формат
  // email.». Тримаємо composite-патерн вище і використовуємо межу слова
  // у вузькій гілці.
  if (/user already exists/i.test(message))
    return "Цей email вже зареєстровано. Спробуй увійти.";
  if (/invalid email or password/i.test(message))
    return "Невірний email або пароль.";
  if (/password too short/i.test(message)) return "Пароль занадто короткий.";
  if (/password too long/i.test(message)) return "Пароль занадто довгий.";
  if (/^invalid email\b/i.test(message)) return "Невірний формат email.";
  if (/invalid password/i.test(message)) return "Невірний пароль.";
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
    message: typeof e.message === "string" ? e.message : null,
    error: typeof e.error === "string" ? e.error : null,
    code: typeof e.code === "string" ? e.code : null,
    status: typeof e.status === "number" ? e.status : null,
    statusText: typeof e.statusText === "string" ? e.statusText : null,
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
  register: (email: string, password: string, name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  refresh: () => Promise<void>;
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

  const user = meQuery.data?.user ?? null;
  const isLoading = meQuery.isLoading;
  const status: AuthStatus = isLoading
    ? "loading"
    : user
      ? "authenticated"
      : "unauthenticated";

  const [authError, setAuthError] = useState<string | null>(null);

  const invalidateMe = useCallback(
    () =>
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.me.current() }),
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

  const register = useCallback(
    async (email: string, password: string, name: string) => {
      setAuthError(null);
      try {
        const result = await signUp.email({ email, password, name });
        if (result?.error) {
          setAuthError(translateAuthError(result.error, "Помилка реєстрації"));
          return false;
        }
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

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // Ігноруємо: навіть якщо Better Auth endpoint повернув помилку,
      // далі все одно викидаємо локальний me-кеш — UI має показати
      // sign-in surface, а не застрягти в «напів-залогіненому» стані.
    }
    await invalidateMe();
  }, [invalidateMe]);

  // Привʼязуємо/відвʼязуємо аналітику до userId. Ref тримає попередній
  // userId, щоб `reset()` викликався тільки на реальному переході
  // authenticated → unauthenticated, а не при першому mount з `null`.
  // Traits (vibe / plan / locale / signup_date) збираються у
  // `buildIdentifyTraits()` — див. JSDoc у `identifyTraits.ts` про
  // джерела і поведінку при відсутності localStorage / navigator.
  const lastIdentifiedUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = user?.id ?? null;
    const prevId = lastIdentifiedUserIdRef.current;
    if (currentId && user && currentId !== prevId) {
      // Cast у `Record<string, unknown>` — `IdentifyTraits` має іменовані
      // опціональні поля без index-signature, тому TS не звужує його до
      // record-у автоматично. Контракт `identifyPostHogUser` приймає
      // довільний bag-of-properties — типи трейтів захищає сам
      // `buildIdentifyTraits`.
      identifyPostHogUser(
        currentId,
        buildIdentifyTraits(user) as Record<string, unknown>,
      );
      lastIdentifiedUserIdRef.current = currentId;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Request a password reset email via Better Auth. Returns `true` when
  // the request was accepted (the server still answers OK even if the
  // address isn't registered — we don't leak account enumeration). The
  // UI uses that flag to show a neutral "check your inbox" state.
  const requestPasswordReset = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      const redirectTo = `${window.location.origin}/reset-password`;
      const result = await forgetPassword({ email, redirectTo });
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
