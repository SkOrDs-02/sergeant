import { Suspense, useEffect } from "react";
import { ErrorBoundary } from "../ErrorBoundary";
import { lazyImport } from "../lib/lazyImport";
import type { OpenModuleOptions } from "../hooks/useHubNavigation";

const HubSearch = lazyImport(() => import("../hub/search"), "HubSearch");

// Коли модалка крешиться, `ErrorBoundary` рендерить `null`, але стан
// `searchOpen` у `useHubUIState` лишається `true` — усі хендлери
// закриття (Esc, click-outside, X) живуть усередині самої модалки і
// після збою вже не рендеряться. Без явного виклику `onClose`
// користувач опиняється у "невидимій" модалці, яку не можна ні
// закрити, ні перевідкрити (React ігнорує `setSearchOpen(true)`, бо
// значення вже `true`).
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
  searchOpen: boolean;
  onCloseSearch: () => void;
  onOpenModule: (
    id: string | null | undefined,
    opts?: OpenModuleOptions,
  ) => void;
}

export function HubModals({
  searchOpen,
  onCloseSearch,
  onOpenModule,
}: HubModalsProps) {
  return (
    <>
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
