import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
// Самохостинг шрифту замість Google Fonts: сторінка суцільно україномовна, а
// попередній DM Sans узагалі не має кириличного набору (U+0400–04FF відсутній
// у нього в обох підмножинах), тож кирилиця падала на системний шрифт і в
// одному рядку сусідили два різні накреслення. Manrope – канонічний шрифт
// продукту (`packages/design-tokens/tailwind-preset.js`), має кирилицю, і той
// самий пакет уже стоїть у `apps/web`. Підмножини тягнуться за `unicode-range`,
// тож грецька та в'єтнамська не завантажуються ніколи.
import "@fontsource-variable/manrope";
// Display-шрифт напряму «Порядок без крику»: Unbounded має повну кирилицю
// (включно з ї/є/ґ) і вантажиться самохостингом з тих самих причин, що й
// Manrope вище. 500 – маркування блоків, 700/800 – заголовки і кнопки.
import "@fontsource/unbounded/500.css";
import "@fontsource/unbounded/700.css";
import "@fontsource/unbounded/800.css";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);

// Кожна сторінка приходить пререндереною (scripts/prerender.mjs), тож React
// гідрує готовий DOM, а не малює його заново. До 2026-10-08 тут стояв
// `createRoot`: він викидав пререндер і будував той самий DOM ще раз, і на
// повільному телефоні через 1-1,5 с після першого кадру скидався скрол, а
// відкрите питання FAQ закривалось (аудит сайту 2026-10-08, F1). Порожній
// `#root` буває лише на dev-сервері, там лишається звичайний рендер.
if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
