import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
// Самохостинг шрифтів замість Google Fonts: сторінка суцільно україномовна,
// а DM Sans, що стояв колись, не мав кирилиці. Manrope – канонічний шрифт
// продукту (`packages/design-tokens/tailwind-preset.js`), Unbounded – display
// напряму «Порядок без крику» (500 – маркування блоків, 700/800 – заголовки і
// кнопки). Файли – підмножини лише з символів сайту, згенеровані
// `scripts/subset-fonts.mjs` з пакетів fontsource (аудит сайту 2026-10-08,
// F5): повні підмножини fontsource важили 107-140 КБ на сторінку.
import "./fonts/fonts.css";
import App from "./App";
import { currentPathname } from "./routing/routes";
import { loadPage } from "./routing/loadPage";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

const root = document.getElementById("root")!;
const pathname = currentPathname();

// Кожна сторінка приходить пререндереною (scripts/prerender.mjs), тож React
// гідрує готовий DOM, а не малює його заново. До 2026-10-08 тут стояв
// `createRoot`: він викидав пререндер і будував той самий DOM ще раз, і на
// повільному телефоні через 1-1,5 с після першого кадру скидався скрол, а
// відкрите питання FAQ закривалось (аудит сайту 2026-10-08, F1). Порожній
// `#root` буває лише на dev-сервері, там лишається звичайний рендер.
//
// Чанк сторінки вантажиться ДО гідрації (аудит 2026-10-08, F3): лінивий
// компонент під `Suspense` віддав би фолбек замість пререндера. Поки чанк
// їде, сторінка вже видима й читабельна, бо HTML пререндерений.
void loadPage(pathname).then((Page) => {
  const app = (
    <StrictMode>
      <App pathname={pathname} Page={Page} />
    </StrictMode>
  );
  if (root.hasChildNodes()) {
    hydrateRoot(root, app);
  } else {
    createRoot(root).render(app);
  }
});
