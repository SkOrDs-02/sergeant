// Разовий візуальний прогін усіх маршрутів по vite preview для рев'ю.
// Запуск: node scripts/shot-pages.mjs (потрібен попередній `pnpm build`).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "shots");
const ROUTES = [
  ["/", "home"],
  ["/beta", "beta"],
  ["/about", "about"],
  ["/hroshi", "hroshi"],
  ["/yizha", "yizha"],
  ["/zvychky", "zvychky"],
  ["/trenuvannia", "trenuvannia"],
  ["/ruchna-robota", "ruchna-robota"],
  ["/vyhid", "vyhid"],
  ["/guides", "guides"],
  ["/zvyazky", "zvyazky"],
  ["/stan", "stan"],
  ["/obitsyanky", "obitsyanky"],
  ["/pytannya", "pytannya"],
  ["/guides/monobank", "guide-monobank"],
  ["/guides/kbzhv", "guide-kbzhv"],
  ["/guides/cheky", "guide-cheky"],
  ["/guides/foto-kalorii", "guide-foto-kalorii"],
  ["/guides/bank-bezpeka", "guide-bank-bezpeka"],
  ["/guides/kilka-bankiv", "guide-kilka-bankiv"],
  ["/guides/pauza-i-propusk", "guide-pauza-i-propusk"],
  ["/guides/ohlyad-dnya", "guide-ohlyad-dnya"],
  ["/guides/tyzhnevyi-pidsumok", "guide-tyzhnevyi-pidsumok"],
  ["/data", "data"],
  ["/privacy", "privacy"],
  ["/terms", "terms"],
  ["/404", "404"],
  ["/nope", "404-fallback"],
];

const server = spawn(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "vite", "preview", "--port", "3199", "--strictPort"],
  { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" },
);

await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [route, name] of ROUTES) {
    for (const [w, h, tag] of [
      [1280, 900, "desktop"],
      [390, 844, "mobile"],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`http://127.0.0.1:3199${route}`, {
        waitUntil: "networkidle",
      });
      await page.screenshot({
        path: path.join(OUT, `${name}-${tag}.png`),
        fullPage: true,
      });
    }
    console.log("ok", name);
  }
} finally {
  await browser.close();
  server.kill();
}
