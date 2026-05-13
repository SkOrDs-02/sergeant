/**
 * @scaffolded — extracted from `AuthPage.tsx` by [a53e10b0](https://github.com/Skords-01/Sergeant/commit/a53e10b0)
 *   for Hard Rule #18 (max-lines: 600). [PR #2586](https://github.com/Skords-01/Sergeant/pull/2586)
 *   re-inlined AuthPage UX (autocomplete, password toggle, errors) and
 *   reverted the decomposition — `AuthPage.tsx` is now 693 LOC again.
 *   These helpers stay as the canonical re-decomposition target.
 *
 * @nextStep Re-wire `AuthPage.tsx` to import this module + the other
 *   sibling `auth/*` helpers; bring AuthPage.tsx back below 600 LOC.
 *   Tracked in 2026-05-13 dead-code roast § P1.6.
 */

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";

type ForgotState = "idle" | "sending" | "sent";

export interface UseForgotPasswordResult {
  showForgot: boolean;
  forgotState: ForgotState;
  forgotEmail: string;
  setForgotEmail: (value: string) => void;
  openPanel: (currentEmail: string) => void;
  closePanel: () => void;
  submit: () => Promise<void>;
}

// Hook owns reset-password panel state (open/closed, in-flight, prefilled
// email) and the 6-сек auto-close timer after a successful send. Lives
// separately from `ForgotPasswordPanel` so the parent (`AuthPage`) can
// toggle the panel from the LoginForm's "Забули пароль?" button without
// the panel itself driving its own lifecycle.
export function useForgotPassword(): UseForgotPasswordResult {
  const { requestPasswordReset, setAuthError } = useAuth();

  const [showForgot, setShowForgot] = useState(false);
  // "idle" → панель рендерить reset-форму; "sending" — кнопка
  // disabled під час запиту; "sent" — заміняє форму нейтральним
  // confirmation (без enumeration hint-у), щоб користувач знав
  // перевірити інбокс.
  const [forgotState, setForgotState] = useState<ForgotState>("idle");
  const [forgotEmail, setForgotEmail] = useState("");

  const openPanel = (currentEmail: string) => {
    setAuthError(null);
    setForgotState("idle");
    setForgotEmail((cur) => cur || currentEmail || "");
    setShowForgot((v) => !v);
  };

  const closePanel = () => {
    setShowForgot(false);
    setForgotState("idle");
    setAuthError(null);
  };

  const submit = async () => {
    const target = (forgotEmail || "").trim();
    if (!target) {
      setAuthError("Введи email, на який відправити лист.");
      return;
    }
    setForgotState("sending");
    const ok = await requestPasswordReset(target);
    setForgotState(ok ? "sent" : "idle");
  };

  // Авто-згортання forgot-панелі після успіху (UX roast 2026-Q2 A14):
  // confirmation-параграф висить безкінечно без цього — юзер не
  // розуміє, що робити далі. Після 6 сек бездіяльності закриваємо
  // панель і повертаємо логін-форму як default state. Кнопка «Назад до
  // входу» дає ручний вихід раніше (`closePanel`).
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (showForgot && forgotState === "sent") {
      autoCloseTimerRef.current = setTimeout(() => {
        setShowForgot(false);
        setForgotState("idle");
        setAuthError(null);
      }, 6000);
    }
    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
    };
  }, [showForgot, forgotState, setAuthError]);

  return {
    showForgot,
    forgotState,
    forgotEmail,
    setForgotEmail,
    openPanel,
    closePanel,
    submit,
  };
}
