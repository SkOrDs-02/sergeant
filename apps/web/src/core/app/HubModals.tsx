import { lazy, Suspense, useEffect } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import type { OpenModuleOptions } from "../hooks/useHubNavigation";
import { HubChatFab } from "../hub/HubChatFab";

const HubSearch = lazy(() =>
  import("../hub/search").then((m) => ({ default: m.HubSearch })),
);
const HubChat = lazy(() => import("../hub/HubChat"));

// Коли модалка крешиться, `ErrorBoundary` рендерить `null`, але стан
// `chatOpen` / `searchOpen` у `useHubUIState` лишається `true` — усі
// хендлери закриття (Esc, click-outside, X) живуть усередині самої
// модалки і після збою вже не рендеряться. Без явного виклику
// `onClose` користувач опиняється у "невидимій" модалці, яку не
// можна ні закрити, ні перевідкрити (React ігнорує `setChatOpen(true)`,
// бо значення вже `true`).
//
// `CloseOnError` — крихітний side-effect-only компонент: після mount
// кличе `onClose`, що очищує стан у батьківському хуку. Рендер
// `null` зберігає попередню поведінку (користувач не бачить
// поламаної модалки), але тепер без "залиплого" стану.
function CloseOnError({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    onClose();
  }, [onClose]);
  return null;
}

export interface HubModalsProps {
  chatOpen: boolean;
  chatMinimized: boolean;
  chatUnseenCount: number;
  onCloseChat: () => void;
  onMinimizeChat: () => void;
  onRestoreChat: () => void;
  onUnseenChange: (count: number) => void;
  chatInitialMessage: string;
  chatAutoSend: boolean;
  onOpenCatalogue: () => void;
  searchOpen: boolean;
  onCloseSearch: () => void;
  onOpenModule: (
    id: string | null | undefined,
    opts?: OpenModuleOptions,
  ) => void;
}

export function HubModals({
  chatOpen,
  chatMinimized,
  chatUnseenCount,
  onCloseChat,
  onMinimizeChat,
  onRestoreChat,
  onUnseenChange,
  chatInitialMessage,
  chatAutoSend,
  onOpenCatalogue,
  searchOpen,
  onCloseSearch,
  onOpenModule,
}: HubModalsProps) {
  return (
    <>
      {chatOpen && (
        <ErrorBoundary fallback={<CloseOnError onClose={onCloseChat} />}>
          <Suspense fallback={null}>
            <HubChat
              onClose={onCloseChat}
              initialMessage={chatInitialMessage}
              autoSendInitial={chatAutoSend}
              onOpenCatalogue={onOpenCatalogue}
              isMinimized={chatMinimized}
              onMinimize={onMinimizeChat}
              onUnseenChange={onUnseenChange}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {chatOpen && chatMinimized && (
        <HubChatFab onRestore={onRestoreChat} unseenCount={chatUnseenCount} />
      )}

      {searchOpen && (
        <ErrorBoundary fallback={<CloseOnError onClose={onCloseSearch} />}>
          <Suspense fallback={null}>
            <HubSearch onClose={onCloseSearch} onOpenModule={onOpenModule} />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
}
