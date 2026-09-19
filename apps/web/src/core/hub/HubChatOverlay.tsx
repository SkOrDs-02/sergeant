import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ASSISTANT_PATH, CAPABILITIES_PATH } from "../app/appPaths";
import { lazyDefault } from "../lib/lazyImport";
import { useHubChatOverlay } from "./useHubChatOverlay";

// AI-DANGER: аркуш чату — ЛІНИВИЙ, і це не оптимізація «про всяк випадок».
//
// Цей компонент статично імпортує `RootLayout` (нижче пояснено, чому він
// мусить бути змонтований завжди), тож усе, що він тягне статично, лежить на
// критичному шляху першого екрана. Поки `Sheet` жив тут, разом із ним туди
// їхав увесь стек аркуша (`useSwipeToDismiss`, `useBodyScrollLock`,
// `useKeyboardAwareOverlay`, `useVisualKeyboardInset`) — ~2.8 kB brotli,
// яких перший кадр не показує ніколи. Замір і розбір: `AGENTS.md
// § Performance budgets` (ратчет eager 2026-09-16).
//
// **Не повертай сюди прямий імпорт `Sheet`, `HubChat` чи будь-чого з
// їхнього графа.** Нове важке — у `HubChatSheet.tsx`.
const HubChatSheet = lazyDefault(() => import("./HubChatSheet"));

/**
 * Sergeant v2 Phase 7 D5 — HubChat bottom-sheet overlay shell.
 *
 * Mounts once at the app root (inside `<HubChatOverlayProvider>`) and
 * renders the chat sheet whenever `useHubChatOverlay().open` flips true.
 * The full-screen `/chat` route remains mounted (see
 * `StandaloneRoutes.tsx` → `HubChatPage`) so deep links, the AIPill voice
 * commit (`navigate('/chat?q=…')`), and notification landing URLs still
 * resolve to a real URL — the overlay is purely an additive Hub-UX surface.
 *
 * Цей файл лишається eager навмисно: він тримає намір повернення з каталогу
 * і ефект маршруту, які мусять працювати і при ЗАКРИТОМУ чаті. Візуальна
 * частина винесена в лінивий [`HubChatSheet`](./HubChatSheet.tsx) — див.
 * застереження на початку файлу.
 */
export function HubChatOverlay() {
  const { open, initialMessage, autoSendInitial, preset, openChat, closeChat } =
    useHubChatOverlay();
  const location = useLocation();
  const navigate = useNavigate();

  // Маршрут, з якого чат пішов у каталог, і намір повернути його назад.
  //
  // AI-CONTEXT (звіт власника 2026-09-15): «?» у композері веде на
  // `/assistant`, а повернення свайпом чи стрілкою викидало на хаб — і це
  // не налаштування сторінки каталогу, а наслідок того, що чат тут НЕ
  // маршрут, а лист (`useState` в `useHubChatOverlayState`). Навігація
  // знімає його ефектом нижче, тож `history.back()` повертає рівно ту
  // сторінку, що була ПІД чатом, і про сам чат історія нічого не знає.
  // Тому намір тримаємо тут: запамʼятовуємо, звідки пішли, і відкриваємо
  // чат назад, коли повернулись саме туди. Саме через цей намір компонент
  // лишається змонтованим і при закритому чаті — інакше ref обнулявся б.
  const catalogueReturnRef = useRef<string | null>(null);

  const handleClose = useCallback(() => {
    // Явне закриття скасовує намір: людина закрила чат сама, вертати його
    // на наступній навігації було б поверненням того, що прибрали.
    catalogueReturnRef.current = null;
    closeChat();
  }, [closeChat]);

  // `/help` and the composer "?" button open the capability catalogue.
  // Navigating away auto-dismisses this sheet (see the route-change effect
  // below), so the catalogue route takes over cleanly.
  const handleOpenCatalogue = useCallback(() => {
    catalogueReturnRef.current = location.pathname;
    navigate(ASSISTANT_PATH);
  }, [navigate, location.pathname]);

  // Auto-dismiss on route change. Without this, any `navigate()` triggered
  // from a child of the sheet (PaywallModal CTA → `/pricing`, action-card
  // deep-link, etc.) routes the page underneath while the glass sheet stays
  // mounted — the user sees the chat panel hovering over a fresh route.
  // The sheet's open-state lives in app-root context (in-memory `useState`
  // inside `useHubChatOverlayState`) and survives navigations by design;
  // this effect is the single hook that links route lifecycle back to
  // overlay state. `firstRenderRef` skips the very first run so the
  // overlay opens on the route where the user invoked it, then closes only
  // on subsequent navigations.
  const firstRenderRef = useRef(true);
  const openRef = useRef(open);
  const closeChatRef = useRef(closeChat);
  const openChatRef = useRef(openChat);
  useLayoutEffect(() => {
    openRef.current = open;
    closeChatRef.current = closeChat;
    openChatRef.current = openChat;
  });
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    if (openRef.current) {
      closeChatRef.current();
      return;
    }
    const returnTo = catalogueReturnRef.current;
    if (returnTo === null) return;
    // Повернулись рівно туди, звідки пішли в каталог — піднімаємо чат
    // назад. Сесія не губиться: її тримає `useChatSessions` усередині
    // HubChat, оверлей лише вирішує, чи він на екрані.
    if (location.pathname === returnTo) {
      catalogueReturnRef.current = null;
      openChatRef.current();
      return;
    }
    // Пішли з каталогу кудись іще (тариф, глибокий лінк) — намір більше не
    // чинний. Без цього чат сплив би сам собою, коли людина колись
    // повернеться на ту сторінку зовсім іншим шляхом.
    if (
      location.pathname !== ASSISTANT_PATH &&
      location.pathname !== CAPABILITIES_PATH
    ) {
      catalogueReturnRef.current = null;
    }
  }, [location.pathname]);

  if (!open) return null;

  // `fallback={null}` навмисно: до відкриття на екрані й так нічого не було,
  // а сам чанк аркуша лежить у precache сервіс-воркера (`injectManifest`),
  // тож у типовому сценарії він резолвиться з кешу без мережевого кроку.
  return (
    <Suspense fallback={null}>
      <HubChatSheet
        onClose={handleClose}
        onOpenCatalogue={handleOpenCatalogue}
        initialMessage={initialMessage}
        autoSendInitial={autoSendInitial}
        preset={preset}
      />
    </Suspense>
  );
}

export default HubChatOverlay;
