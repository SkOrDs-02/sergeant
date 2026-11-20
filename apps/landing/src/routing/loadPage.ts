import type { ComponentType } from "react";
import { ROUTE_PAGES, resolveRoute } from "./routes";

type PageModule = { default: ComponentType };

/**
 * Лінивий glob: Vite кладе кожну сторінку в окремий чанк, і браузер тягне
 * лише той, що потрібен поточній адресі. Пререндер додає в HTML сторінки
 * `modulepreload` саме на її чанк (`scripts/prerender.mjs`), тож чанк їде
 * паралельно з головним скриптом, а не після нього.
 */
const PAGES = import.meta.glob<PageModule>("../pages/*Page.tsx");

export async function loadPage(path: string): Promise<ComponentType> {
  const file = `../pages/${ROUTE_PAGES[resolveRoute(path)]}.tsx`;
  const load = PAGES[file];
  if (!load) throw new Error(`loadPage: немає модуля ${file}`);
  return (await load()).default;
}
