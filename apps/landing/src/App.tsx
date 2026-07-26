import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "./lib/analytics";

/**
 * Шляхи з контракту `LANDING_VIEWED`; усе інше зводиться до `/404`.
 *
 * Лендінг однасторінковий: конверсія веде в Telegram, тож сторінки подяки
 * більше немає — підтвердження людина бачить від бота, а не від сайту.
 */
const TRACKED_PATHS = new Set(["/"]);

/**
 * Зовнішній referrer першого входу. Внутрішні переходи віддають наш власний
 * домен — це шум, який зіпсував би атрибуцію каналів, тож він відкидається.
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

function usePageview() {
  const { pathname } = useLocation();
  useEffect(() => {
    const ref = externalReferrer();
    track(ANALYTICS_EVENTS.LANDING_VIEWED, {
      path: TRACKED_PATHS.has(pathname) ? pathname : "/404",
      locale: LANDING_LOCALE,
      ...(ref ? { referrer: ref } : {}),
    });
  }, [pathname]);
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  usePageview();

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
