// Mobile device-emulation QA pass for apps/web (demo mode, populated state).
// Seeds demo once, then visits each route under iPhone + Pixel descriptors,
// waits for hydration (skeletons cleared), screenshots, and audits:
//   - touch-target sizing (Hard Rule >=44x44), with sr-only + hidden-input→label handling
//   - horizontal overflow
//   - typography floor (computed font-size < 12px, Hard Rule #16)
//
// Usage: node _scratch/qa/mobile-audit.mjs [baseURL]
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const OUT = new URL("./mobile-shots/", import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  "$1",
);
const TOUCH_MIN = 44;
const FONT_MIN = 12;

const DEVICES = [
  {
    id: "iphone15",
    name: "iPhone 15",
    descriptor: devices["iPhone 15"] ?? devices["iPhone 14"],
  },
  {
    id: "pixel7",
    name: "Pixel 7",
    descriptor: devices["Pixel 7"] ?? devices["Pixel 5"],
  },
];

const ROUTES = [
  { id: "hub", path: "/" },
  { id: "finyk", path: "/finyk" },
  { id: "fizruk", path: "/fizruk" },
  { id: "fizruk-workouts", path: "/fizruk/workouts" },
  { id: "nutrition", path: "/nutrition" },
  { id: "nutrition-log", path: "/nutrition/log" },
  { id: "nutrition-menu", path: "/nutrition/menu" },
  { id: "routine", path: "/routine" },
  { id: "insights", path: "/insights" },
  { id: "settings", path: "/settings" },
];

// Wait until SPA hydrated: redirect settled, skeletons gone, body text present.
async function waitHydrated(page, maxMs = 14000) {
  const start = Date.now();
  let last = { skel: -1, txt: 0 };
  while (Date.now() - start < maxMs) {
    try {
      last.skel = await page.evaluate(
        () =>
          document.querySelectorAll('.animate-pulse,[class*="skeleton"]')
            .length,
      );
      last.txt = await page.evaluate(
        () => document.body.innerText.trim().length,
      );
    } catch {
      await page.waitForTimeout(300);
      continue; // navigation in flight
    }
    if (last.skel === 0 && last.txt > 150) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400); // settle paint
  return last;
}

function auditInPage([touchMin, fontMin]) {
  const vw = window.innerWidth;
  const docW = document.documentElement.scrollWidth;
  const overflow =
    docW > vw + 1
      ? { scrollWidth: docW, viewport: vw, overflowBy: docW - vw }
      : null;

  const isHidden = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0")
      return true;
    const cls =
      (el.className && el.className.baseVal !== undefined
        ? el.className.baseVal
        : el.className) || "";
    if (/\bsr-only\b|\bvisually-hidden\b/.test(String(cls))) return true;
    if (s.clip === "rect(0px, 0px, 0px, 0px)" || s.clipPath === "inset(50%)")
      return true;
    return false;
  };
  // Effective tap rect: for a visually-hidden input backing a custom control, use its label.
  const tapRect = (el) => {
    if (el.tagName === "INPUT" && isHidden(el)) {
      let lbl = el.id
        ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        : null;
      lbl = lbl || el.closest("label");
      if (lbl) return { rect: lbl.getBoundingClientRect(), via: "label" };
    }
    return { rect: el.getBoundingClientRect(), via: "self" };
  };

  const SEL =
    'button, a[href], [role="button"], [role="link"], [role="tab"], [role="switch"], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const seen = new Set();
  const tooSmall = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (el.closest("[data-compact]")) continue;
    const s = getComputedStyle(el);
    if (
      s.display === "none" ||
      s.visibility === "hidden" ||
      s.pointerEvents === "none"
    )
      continue;
    // skip elements that are purely keyboard a11y (sr-only skip links etc.)
    if (isHidden(el) && el.tagName !== "INPUT") continue;
    const { rect: r, via } = tapRect(el);
    if (r.width === 0 || r.height === 0) continue;
    if (r.width >= touchMin && r.height >= touchMin) continue;
    const label = (
      el.getAttribute("aria-label") ||
      el.textContent ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      ""
    )
      .trim()
      .slice(0, 40);
    const key =
      el.tagName +
      "|" +
      label +
      "|" +
      Math.round(r.width) +
      "x" +
      Math.round(r.height);
    if (seen.has(key)) continue;
    seen.add(key);
    tooSmall.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || null,
      type: el.getAttribute("type") || null,
      label,
      w: Math.round(r.width),
      h: Math.round(r.height),
      via,
    });
  }

  // Typography floor: visible text-bearing leaf elements under font floor.
  const tinyText = [];
  const tseen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const direct = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
    );
    if (!direct) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const fs = parseFloat(s.fontSize);
    if (!(fs < fontMin - 0.5)) continue;
    const txt = el.textContent.trim().slice(0, 30);
    const key = fs + "|" + txt;
    if (tseen.has(key)) continue;
    tseen.add(key);
    tinyText.push({ fontSizePx: Math.round(fs * 10) / 10, text: txt });
  }

  return {
    overflow,
    tooSmall,
    tinyText,
    touchTargetsScanned: document.querySelectorAll(SEL).length,
  };
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = {
    base: BASE,
    touchMin: TOUCH_MIN,
    fontMin: FONT_MIN,
    devices: {},
  };

  for (const dev of DEVICES) {
    const context = await browser.newContext({ ...dev.descriptor });
    const page = await context.newPage();
    report.devices[dev.id] = {
      name: dev.name,
      viewport: dev.descriptor.viewport,
      routes: [],
    };

    // Seed demo once per context (localStorage/kvvfs persists across hard nav).
    await page
      .goto(BASE + "/?demo=1", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      })
      .catch(() => {});
    await waitHydrated(page);

    for (const route of ROUTES) {
      const entry = { id: route.id, path: route.path };
      try {
        await page.goto(BASE + route.path, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        const h = await waitHydrated(page);
        entry.hydrate = h;
        const shot = `${OUT}/${dev.id}-${route.id}.png`;
        await page.screenshot({ path: shot, fullPage: false });
        entry.screenshot = shot;
        entry.audit = await page.evaluate(auditInPage, [TOUCH_MIN, FONT_MIN]);
        entry.url = page.url();
        const n = entry.audit.tooSmall.length,
          tt = entry.audit.tinyText.length;
        const ov = entry.audit.overflow
          ? ` OVERFLOW+${entry.audit.overflow.overflowBy}px`
          : "";
        console.log(
          `[${dev.id}] ${route.id.padEnd(18)} small=${n} tiny-text=${tt}${ov}`,
        );
      } catch (err) {
        entry.error = String(err).slice(0, 200);
      }
      report.devices[dev.id].routes.push(entry);
    }
    await context.close();
  }

  await browser.close();
  await writeFile(`${OUT}/audit-report.json`, JSON.stringify(report, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
