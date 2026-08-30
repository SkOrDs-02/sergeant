import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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
// Piazzolla italic – «паперові» цитати-інсайти і підпис автора.
import "@fontsource/piazzolla/500-italic.css";
import App from "./App";
import "./index.css";
import { initAnalytics } from "./lib/analytics";

initAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
