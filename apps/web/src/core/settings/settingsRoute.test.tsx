/** @vitest-environment jsdom */
/**
 * Redirect smoke for `/settings/*` — L-1 fix (profile/settings deep audit,
 * `docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md`, рішення
 * власника «варіант а»): маршрут БІЛЬШЕ НЕ монтує власну оболонку з
 * `HubSettingsPage` (немає хедера, нижньої навігації, `role="tabpanel"` —
 * глухий кут, з якого можна було вийти лише жестом браузера). Тепер це
 * чистий редирект у вкладку хаба (`/?tab=settings`), що переносить УСІ
 * query-параметри і hash без винятків.
 *
 * До 2026-08-08 цей файл пінив стару форму (`<main>` + мокнутий
 * `lazyImport("HubSettingsPage")`) — та поведінка більше не існує, тому
 * тести підмінені повністю, а не доповнені.
 *
 * Ці тести навмисно НЕ мокають `react-router-dom` — `MemoryRouter` +
 * реальний `<Navigate>` дають правдиву перевірку самого механізму
 * редиректу (search/hash-мердж, `replace`), а не заявленого наміру.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
} from "react-router-dom";
import { Component as SettingsRoute } from "./route";

interface LandedLocation {
  pathname: string;
  search: string;
  hash: string;
  navigationType: string;
}

/**
 * Захоплює локацію ПІСЛЯ того, як `SettingsRoute` відредиректив —
 * змонтована на `"/*"`, тобто на будь-якій кінцевій точці, куди привіз
 * редирект. `useNavigationType()` віддає тип ОСТАННЬОЇ навігації
 * ("POP"/"PUSH"/"REPLACE") — саме так тест нижче перевіряє, що редирект
 * пішов через `replace`, а не `push`.
 */
function LocationSpy() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div data-testid="landed">
      {JSON.stringify({
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        navigationType,
      })}
    </div>
  );
}

function renderAt(entry: string): LandedLocation {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/settings/*" element={<SettingsRoute />} />
        <Route path="/*" element={<LocationSpy />} />
      </Routes>
    </MemoryRouter>,
  );
  return JSON.parse(
    screen.getByTestId("landed").textContent ?? "{}",
  ) as LandedLocation;
}

describe("settings route redirect (L-1, 2026-08-08)", () => {
  it("redirects bare /settings to the hub Settings tab", () => {
    const landed = renderAt("/settings");
    expect(landed.pathname).toBe("/");
    expect(landed.search).toBe("?tab=settings");
    expect(landed.hash).toBe("");
  });

  // Прямий регресійний гейт на L-2: якщо цей перехід загубить `?billing=`,
  // `HubSettingsPage`'s `readBillingReturnSectionId` більше ніколи його не
  // побачить — повернення з платіжного порталу (єдиний сценарій обох
  // поверхонь, куди приходять із ЗОВНІШНЬОГО origin) знову приземлятиме
  // юзера на холодний дашборд без жодного підтвердження.
  it("preserves ?billing=, ?group=, and #settings-<id> hash together with the new ?tab=settings (L-2 regression gate)", () => {
    const landed = renderAt(
      "/settings?billing=portal-return&group=advanced#settings-plan",
    );
    const params = new URLSearchParams(landed.search);
    expect(params.get("tab")).toBe("settings");
    expect(params.get("billing")).toBe("portal-return");
    expect(params.get("group")).toBe("advanced");
    expect(landed.hash).toBe("#settings-plan");
  });

  // `replace` — обовʼязково: без нього «Назад» після платіжного порталу
  // веде на `/settings`, який одразу редиректить знову (нескінченний
  // відскок). Перевіряємо через `useNavigationType()`, а не мокаючи
  // `useNavigate`, — це той самий сигнал, яким сам react-router визначає
  // PUSH/REPLACE/POP, тож тест ловить регресію, якщо хтось замінить
  // `<Navigate replace>` на `<Navigate>` без replace.
  it("navigates with replace so the /settings entry does not grow history", () => {
    const landed = renderAt("/settings");
    expect(landed.navigationType).toBe("REPLACE");
  });

  // `path: "settings/*"` (`router.tsx`) матчить і `/settings/будь-що`.
  // Реальних під-шляхів під `/settings/` у репо немає (перевірено grep-ом
  // по кодовій базі) — цей тест документує, що splat-хвіст просто
  // ІГНОРУЄТЬСЯ: редирект завжди веде в `/`, а query з хвостом
  // зберігається так само, як для bare `/settings`.
  it("ignores an unknown splat sub-path — no real /settings/* sub-routes exist", () => {
    const landed = renderAt("/settings/anything?group=advanced");
    expect(landed.pathname).toBe("/");
    const params = new URLSearchParams(landed.search);
    expect(params.get("group")).toBe("advanced");
    expect(params.get("tab")).toBe("settings");
  });
});
