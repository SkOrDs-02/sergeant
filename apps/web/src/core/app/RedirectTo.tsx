import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Tiny effect-only component so the redirect is a declarative render,
// not a `navigate()` call in the middle of AppInner — keeps the render
// phase free of side effects and avoids the React warning.
//
// 2026-05-19 — fallback changed from `<PageLoader />` (hub skeleton)
// to a sr-only aria-live region. The redirect fires in useEffect on
// mount, so the previous fallback briefly flashed a hub skeleton
// before `/welcome` mounted, confusing first-time visitors (bug
// report 2026-05-19). AT users still get a polite status update.
export function RedirectTo({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [navigate, to]);
  return (
    <span className="sr-only" role="status" aria-live="polite">
      Перенаправлення…
    </span>
  );
}
