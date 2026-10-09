/** @vitest-environment jsdom */
/**
 * data-45: гейт незбереженого вводу в `reloadOnceForChunkError` має сенс лише
 * там, де піддерево з формою ЛИШАЄТЬСЯ змонтованим. Boundary, що підміняє
 * дерево карткою помилки, форму все одно знищує, тож відмова від reload там
 * нічого не рятує і лише залишає людину без авто-відновлення (а тост
 * «Перезавантаж, коли збережеш введене» обіцяв би неіснуюче збереження).
 *
 * Тести ганяють справжні boundary, `chunkReload`, `dirtyState`, `updateGate`
 * і `swReload`; мокається тільки `location.reload` (тригер).
 */
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRegisterDirtyState } from "@shared/hooks/useRegisterDirtyState";
import {
  registerDirtyState,
  resetDirtyStateForTests,
} from "@shared/lib/ui/dirtyState";

import { ErrorBoundary } from "./ErrorBoundary";
import ModuleErrorBoundary from "./ModuleErrorBoundary";
import ChunkErrorBoundary from "./hub/ChunkErrorBoundary";
import { RouteErrorElement } from "./app/RouteErrorElement";
import { setMutationProbe } from "./app/updateGate";
import {
  PWA_RELOAD_DEFERRED_EVENT,
  type ReloadDeferredDetail,
} from "./app/swReload";

vi.mock("./errors/ServerErrorPage", () => ({
  ServerErrorPage: () => <div>server-error-page</div>,
}));

function chunkError(): Error {
  return new TypeError(
    "Failed to fetch dynamically imported module: http://x/assets/Sheet-abc.js",
  );
}

/** Відкрита форма: реєструє брудний стан (як `Sheet`) і має поле вводу. */
function OpenForm() {
  useRegisterDirtyState(true);
  return <input aria-label="сума" defaultValue="250" />;
}

/** Кидає chunk-помилку з render, коли `explode` — вже ПІСЛЯ коміту форми. */
function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw chunkError();
  return null;
}

function Harness({
  wrap,
}: {
  wrap: (children: React.ReactNode) => React.ReactNode;
}) {
  const [explode, setExplode] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setExplode(true)}>
        boom
      </button>
      {wrap(
        <>
          <OpenForm />
          <Bomb explode={explode} />
        </>,
      )}
    </>
  );
}

describe("chunk-recovery і незбережений ввід: де форма виживає, а де ні", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;
  const deferred: ReloadDeferredDetail[] = [];
  const onDeferred = (event: Event) => {
    deferred.push((event as CustomEvent<ReloadDeferredDetail>).detail);
  };

  beforeEach(() => {
    sessionStorage.clear();
    deferred.length = 0;
    resetDirtyStateForTests();
    setMutationProbe(null);
    originalLocation = window.location;
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    window.addEventListener(PWA_RELOAD_DEFERRED_EVENT, onDeferred);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener(PWA_RELOAD_DEFERRED_EVENT, onDeferred);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    resetDirtyStateForTests();
    vi.restoreAllMocks();
  });

  async function explodeNow() {
    await act(async () => {
      screen.getByRole("button", { name: "boom" }).click();
    });
    await act(async () => {
      await Promise.resolve();
    });
  }

  it("ModuleErrorBoundary: форма розмонтована boundary, тож авто-reload є, тосту «збережи введене» немає", async () => {
    render(
      <Harness
        wrap={(c) => (
          <ModuleErrorBoundary onBackToHub={vi.fn()}>{c}</ModuleErrorBoundary>
        )}
      />,
    );
    expect(screen.getByLabelText("сума")).toBeInTheDocument();

    await explodeNow();

    // Поле зникло разом з піддеревом модуля, гейт цього не змінює...
    expect(screen.queryByLabelText("сума")).toBeNull();
    // ...тому відновлення лишається автоматичним, а не ручним тостом.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(deferred).toEqual([]);
  });

  it("ErrorBoundary: розмонтування дерева, авто-reload без відмови", async () => {
    render(<Harness wrap={(c) => <ErrorBoundary>{c}</ErrorBoundary>} />);
    await explodeNow();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(deferred).toEqual([]);
  });

  it("RouteErrorElement: errorElement замінив маршрут, авто-reload без відмови", async () => {
    const release = registerDirtyState();
    const router = createMemoryRouter(
      [
        {
          path: "/",
          errorElement: <RouteErrorElement />,
          children: [
            { path: "finyk", lazy: () => Promise.reject(chunkError()) },
          ],
        },
      ],
      { initialEntries: ["/finyk"] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole("alert");

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(deferred).toEqual([]);
    release();
  });

  it("ChunkErrorBoundary: піддерево з формою лишається, reload відкладено тостом", async () => {
    // Форма поза `ChunkErrorBoundary`: boundary підміняє лише власний
    // Suspense-чанк, тож тут гарантія збереження виконується повністю.
    function Page() {
      const [explode, setExplode] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setExplode(true)}>
            boom
          </button>
          <OpenForm />
          <ChunkErrorBoundary>
            <Bomb explode={explode} />
          </ChunkErrorBoundary>
        </>
      );
    }
    render(<Page />);
    await explodeNow();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("сума")).toHaveValue("250");
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(deferred).toEqual([{ reason: "stale-chunk" }]);
  });
});
