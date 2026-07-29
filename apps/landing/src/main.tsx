import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Самохостинг шрифту замість Google Fonts: сторінка суцільно україномовна, а
// попередній DM Sans узагалі не має кириличного набору (U+0400–04FF відсутній
// у нього в обох підмножинах), тож кирилиця падала на системний шрифт і в
// одному рядку сусідили два різні накреслення. Manrope — канонічний шрифт
// продукту (`packages/design-tokens/tailwind-preset.js`), має кирилицю, і той
// самий пакет уже стоїть у `apps/web`. Підмножини тягнуться за `unicode-range`,
// тож грецька та в'єтнамська не завантажуються ніколи.
import "@fontsource-variable/manrope";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
