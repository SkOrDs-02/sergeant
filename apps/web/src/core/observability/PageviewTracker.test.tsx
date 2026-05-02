// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";

const captureMock = vi.fn<(name: string, payload?: object) => void>();

vi.mock("./posthog", () => ({
  capturePostHogEvent: (name: string, payload?: object) =>
    captureMock(name, payload),
}));

import { PageviewTracker } from "./PageviewTracker";

beforeEach(() => {
  captureMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PageviewTracker", () => {
  it("шле $pageview при першому маунті", () => {
    render(
      <MemoryRouter initialEntries={["/welcome"]}>
        <PageviewTracker />
      </MemoryRouter>,
    );

    expect(captureMock).toHaveBeenCalledTimes(1);
    const [eventName, payload] = captureMock.mock.calls[0];
    expect(eventName).toBe("$pageview");
    expect((payload as { $pathname: string }).$pathname).toBe("/welcome");
    expect(typeof (payload as { $current_url: string }).$current_url).toBe(
      "string",
    );
  });

  it("шле новий $pageview на зміну pathname", () => {
    function Nav(): null {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/hub");
      }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/welcome"]}>
        <PageviewTracker />
        <Routes>
          <Route path="/welcome" element={<Nav />} />
          <Route path="/hub" element={<div>hub</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const paths = captureMock.mock.calls.map(
      ([, payload]) => (payload as { $pathname: string }).$pathname,
    );
    expect(paths).toEqual(["/welcome", "/hub"]);
  });

  it("НЕ шле pageview на зміну тільки query-string", () => {
    function Nav(): null {
      const navigate = useNavigate();
      useEffect(() => {
        navigate("/hub?filter=week");
      }, [navigate]);
      return null;
    }

    render(
      <MemoryRouter initialEntries={["/hub"]}>
        <PageviewTracker />
        <Routes>
          <Route path="/hub" element={<Nav />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("стрипає чутливий token у $current_url", () => {
    // jsdom — `window.location.href` читаємо з JSDOM URL; встановлюємо
    // через history API (MemoryRouter не чіпає window.location).
    window.history.replaceState(
      {},
      "",
      "/auth/callback?token=SECRET123&email=u%40x",
    );

    render(
      <MemoryRouter initialEntries={["/auth/callback"]}>
        <PageviewTracker />
      </MemoryRouter>,
    );

    const [, payload] = captureMock.mock.calls[0];
    const url = (payload as { $current_url: string }).$current_url;
    expect(url).not.toContain("SECRET123");
    expect(url).toContain("token=%5Bredacted%5D");
  });
});
