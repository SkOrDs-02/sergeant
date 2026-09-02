import { Suspense, useEffect } from "react";
import { useRouteError } from "react-router-dom";

import { messages } from "@shared/i18n/uk";

import { isChunkLoadError, reloadOnceForChunkError } from "../lib/chunkReload";
import { lazyImport } from "../lib/lazyImport";

/**
 * `errorElement` кореневого маршруту в `router.tsx`.
 *
 * AI-CONTEXT: route-чанки вантажаться через React Router `lazy: () =>
 * import(...)`. Коли такий `import()` відхиляється (після деплою стара
 * вкладка тягне чанк зі старим хешем — саме сценарій `chunkReload.ts`),
 * відхилення ловить САМ роутер, а не `window` — тож глобальні слухачі
 * `installChunkLoadRecover` (`vite:preloadError` / `unhandledrejection`)
 * його не бачать, і без цього елемента користувач отримував дефолтну
 * англійську сторінку «Unexpected Application Error! … Hey developer 👋»
 * без кнопки оновлення (продуктовий аудит 2026-09, UX-3).
 *
 * Поведінка та сама, що в `ChunkErrorBoundary` для `<Suspense>`-чанків:
 * chunk-помилка → один guarded reload (cooldown + cap) і картка з ручним
 * «Перезавантажити», якщо guard відмовив; будь-яка інша помилка → та сама
 * брендована `ServerErrorPage`, що й у top-level `ErrorBoundary` (`main.tsx`).
 */
const ServerErrorPage = lazyImport(
  () => import("../errors/ServerErrorPage"),
  "ServerErrorPage",
);

export function RouteErrorElement() {
  const error = useRouteError();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (chunkError) reloadOnceForChunkError();
  }, [chunkError]);

  if (chunkError) {
    return (
      <div
        role="alert"
        className="min-h-[60vh] p-4 flex flex-col items-center justify-center gap-3 text-center"
      >
        <p className="text-style-body text-muted">
          {messages.errors.generic.sectionFailed}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
        >
          {messages.actions.reload}
        </button>
      </div>
    );
  }

  return (
    <Suspense fallback={null}>
      <ServerErrorPage onReset={() => window.location.reload()} />
    </Suspense>
  );
}
