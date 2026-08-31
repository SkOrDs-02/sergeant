import { useEffect, type ComponentType } from "react";
import HomePage from "./pages/HomePage";
import BetaPage from "./pages/BetaPage";
import AboutPage from "./pages/AboutPage";
import DataPage from "./pages/DataPage";
import GuidesPage from "./pages/GuidesPage";
import RuchnaRobotaPage from "./pages/RuchnaRobotaPage";
import VyhidPage from "./pages/VyhidPage";
import HroshiPage from "./pages/HroshiPage";
import YizhaPage from "./pages/YizhaPage";
import ZvychkyPage from "./pages/ZvychkyPage";
import TrenuvanniaPage from "./pages/TrenuvanniaPage";
import ZvyazkyPage from "./pages/ZvyazkyPage";
import StanPage from "./pages/StanPage";
import ObitsyankyPage from "./pages/ObitsyankyPage";
import PytannyaPage from "./pages/PytannyaPage";
import GuideMonobankPage from "./pages/GuideMonobankPage";
import GuideKbzhvPage from "./pages/GuideKbzhvPage";
import GuideChekyPage from "./pages/GuideChekyPage";
import GuideFotoKaloriiPage from "./pages/GuideFotoKaloriiPage";
import GuideBankBezpekaPage from "./pages/GuideBankBezpekaPage";
import GuideKilkaBankivPage from "./pages/GuideKilkaBankivPage";
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
export const ROUTES: Record<string, ComponentType> = {
  "/": HomePage,
  "/beta": BetaPage,
  "/about": AboutPage,
  "/data": DataPage,
  "/hroshi": HroshiPage,
  "/yizha": YizhaPage,
  "/zvychky": ZvychkyPage,
  "/trenuvannia": TrenuvanniaPage,
  "/ruchna-robota": RuchnaRobotaPage,
  "/vyhid": VyhidPage,
  "/guides": GuidesPage,
  "/zvyazky": ZvyazkyPage,
  "/stan": StanPage,
  "/obitsyanky": ObitsyankyPage,
  "/pytannya": PytannyaPage,
  "/guides/monobank": GuideMonobankPage,
  "/guides/kbzhv": GuideKbzhvPage,
  "/guides/cheky": GuideChekyPage,
  "/guides/foto-kalorii": GuideFotoKaloriiPage,
  "/guides/bank-bezpeka": GuideBankBezpekaPage,
  "/guides/kilka-bankiv": GuideKilkaBankivPage,
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  // Свій маршрут, щоб prerender поклав у dist/404/index.html тіло цієї
  // сторінки, а не пререндерене тіло головної (soft-404 в індексі).
  "/404": NotFoundPage,
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
