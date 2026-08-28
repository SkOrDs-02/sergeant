import { useEffect, type ComponentType } from "react";
import HomePage from "./pages/HomePage";
import BetaPage from "./pages/BetaPage";
import AboutPage from "./pages/AboutPage";
import DataPage from "./pages/DataPage";
import GuidesPage from "./pages/GuidesPage";
import GuideMonobankPage from "./pages/GuideMonobankPage";
import GuideKbzhuPage from "./pages/GuideKbzhuPage";
import GuideChekyPage from "./pages/GuideChekyPage";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import NotFoundPage from "./pages/NotFoundPage";
import { ANALYTICS_EVENTS, LANDING_LOCALE, track } from "./lib/analytics";

/**
 * Маршрути сайту. Лендінг лишається MPA-простим: без client-side router,
 * кожен перехід – повне завантаження, App обирає сторінку за pathname.
 * Новий маршрут = новий запис тут (він же потрапляє в `path` події
 * `LANDING_VIEWED`; усе невідоме зводиться до `/404`).
 */
const ROUTES: Record<string, ComponentType> = {
  "/": HomePage,
  "/beta": BetaPage,
  "/about": AboutPage,
  "/data": DataPage,
  "/guides": GuidesPage,
  "/guides/monobank": GuideMonobankPage,
  "/guides/kbzhu": GuideKbzhuPage,
  "/guides/cheky": GuideChekyPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
};

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
      path: pathname in ROUTES ? pathname : "/404",
      locale: LANDING_LOCALE,
      ...(ref ? { referrer: ref } : {}),
    });
  }, [pathname]);
}

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  usePageview(pathname);

  useEffect(() => {
    // Якірні переходи (/#faq) мають довезти до секції. Нативний скрол по хешу
    // відбувається ДО маунта React-контенту і промахується, тож докручуємо
    // самі після першого кадру.
    const hash = window.location.hash.slice(1);
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView();
    });
  }, []);

  const Page = ROUTES[pathname] ?? NotFoundPage;
  return <Page />;
}
