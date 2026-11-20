import { useEffect, type ComponentType } from "react";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "./lib/analytics";
import { CurrentRouteContext } from "./lib/currentRoute";
import { resolveRoute } from "./routing/routes";

/**
 * Зовнішній referrer першого входу. Внутрішні переходи віддають наш власний
 * домен – це шум, який зіпсував би атрибуцію каналів, тож він відкидається.
 */
function externalReferrer(): string | undefined {
  const ref = document.referrer;
  if (!ref) return undefined;
  try {
    if (new URL(ref).origin === window.location.origin) return undefined;
  } catch {
    return undefined;
  }
  return ref;
}

function usePageview(pathname: string) {
  useEffect(() => {
    const ref = externalReferrer();
    track(ANALYTICS_EVENTS.LANDING_VIEWED, {
      path: resolveRoute(pathname),
      locale: LANDING_LOCALE,
      ...(ref ? { referrer: ref } : {}),
    });
  }, [pathname]);
}

/**
 * Сторінку обирає і завантажує `main.tsx` до гідрації (`routing/loadPage.ts`):
 * так перший рендер клієнта збігається з пререндером, і React не малює
 * фолбек поверх готового DOM.
 */
export default function App({
  pathname,
  Page,
}: {
  pathname: string;
  Page: ComponentType;
}) {
  usePageview(pathname);

  useEffect(() => {
    // Якірні переходи (/#faq) мають довезти до секції. Докручуємо самі після
    // першого кадру на випадок, коли нативний скрол по хешу промахнувся
    // (dev-сервер без пререндеру). Без хеша скрол не чіпаємо: до 2026-10-08
    // тут стояв `scrollTo(0, 0)`, і людину, що встигла проскролити до
    // виконання JS, кидало нагору (аудит сайту 2026-10-08, F1).
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView();
    });
  }, []);

  return (
    <CurrentRouteContext.Provider value={pathname}>
      <Page />
    </CurrentRouteContext.Provider>
  );
}
