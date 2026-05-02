import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { capturePostHogEvent } from "./posthog";
import { sanitizeUrl } from "./sanitizeUrl";

/**
 * Side-effect-only компонент, який шле `$pageview` у PostHog на кожну
 * зміну `pathname`. Монтується всередині `<BrowserRouter>` один раз
 * (`apps/web/src/core/App.tsx`), повертає `null`.
 *
 * Чому власний тречер замість `capture_pageview: true` у `posthog.init`:
 *
 *   1. `$current_url` прокидаємо через `sanitizeUrl()` — magic-link
 *      токени / OAuth-коди не попадають у event-props (той самий патерн,
 *      що й `beforeSend` для cookies у `sentry.ts`).
 *   2. Тригеримо тільки на зміну `pathname` — не на кожну мутацію
 *      query-рядка (фільтри, модалки), щоб не роздувати funnel drop-offs
 *      шумом.
 *   3. Залишаємо `capture_pageleave: false`: Sergeant живе як SPA з
 *      довгими сесіями на одній сторінці (onboarding wizard, Hub dash),
 *      `$pageleave` дав би гіршу апроксимацію engagement, ніж явний
 *      `first_real_entry` + retention-events.
 *
 * Без `VITE_POSTHOG_KEY` — повний no-op (див. `capturePostHogEvent`):
 * ефект викликається, але SDK не підтягується, queue не росте.
 */
export function PageviewTracker(): null {
  const location = useLocation();
  // Guard від подвійного fire при React 18 StrictMode-mount-у: ефект
  // виконується двічі з тим самим `pathname`, SDK сприйняв би це як
  // два окремі pageview-и однієї сторінки.
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const path = location.pathname;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    const $current_url = sanitizeUrl(window.location.href);
    capturePostHogEvent("$pageview", {
      $current_url,
      $pathname: path,
    });
  }, [location.pathname]);

  return null;
}
