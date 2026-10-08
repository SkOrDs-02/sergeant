import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// Tiny effect-only component so the redirect is a declarative render,
// not a `navigate()` call in the middle of AppInner — keeps the render
// phase free of side effects and avoids the React warning.
//
// 2026-05-19 — fallback changed from `<PageLoader />` (hub skeleton)
// to a sr-only aria-live region. The redirect fires in useEffect on
// mount, so the previous fallback briefly flashed a hub skeleton
// before `/welcome` mounted, confusing first-time visitors (bug
// report 2026-05-19). AT users still get a polite status update.
//
// 2026-10-08 (аудит ux-10) — ефект перезапускається при кожній зміні
// `location.key`. Раніше deps були `[navigate, to]`: уже змонтований
// RedirectTo не повторював редирект, коли сусідній механізм (stale
// `setHubView` з `useHubUIState`) повертав URL на «/» — на екрані лишався
// лише sr-only «Перенаправлення…» (кнопка «Назад» після виходу з акаунта).
// Повторюємо `navigate(to, { replace: true })`, доки поточний pathname не
// збігся з pathname із `to`; `replace` не додає зайвих записів в історію.
export function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const targetPathname = to.split(/[?#]/, 1)[0];
  useEffect(() => {
    if (location.pathname === targetPathname) return;
    navigate(to, { replace: true });
  }, [navigate, to, targetPathname, location.key, location.pathname]);
  /* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- sr-only status, UA-only surface */
  return (
    <span className="sr-only" role="status" aria-live="polite">
      Перенаправлення…
    </span>
  );
  /* eslint-enable sergeant-design/no-cyrillic-jsx-literal */
}
