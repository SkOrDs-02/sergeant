// Mobile fix-verification pass for apps/web — REAL app (anon + authed) + demo.
// Modes: `anon` (no session), `authed` (Better Auth session), `demo` (?demo=1).
// Reuses the touch-target / overflow / typography audit from mobile-audit.mjs
// and adds targeted assertions for the M-001..M-005 fixes.
//
// Usage: node _scratch/qa/mobile-verify.mjs <mode> [baseURL]
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const MODE = process.argv[2] ?? "anon";
const BASE = process.argv[3] ?? "http://127.0.0.1:5173";
const OUT = new URL("./mobile-shots/", import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  "$1",
);
const TOUCH_MIN = 44;
const FONT_HARD = 10; // anything below this is an off-scale violation (M-002)
const FONT_FLOOR = 12; // sanctioned sub-floor tokens (10–11px) reported as info

const CREDS = { email: "qa.mobile@sergeant.local", password: "QaMobile!2026" };

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
  { id: "nutrition", path: "/nutrition" },
  { id: "routine", path: "/routine" },
  { id: "insights", path: "/insights" },
  { id: "settings", path: "/settings" },
];

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
      continue;
    }
    if (last.skel === 0 && last.txt > 120) break;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400);
  return last;
}

function auditInPage([touchMin, fontHard, fontFloor]) {
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
  const tapRect = (el) => {
    // A native checkbox/radio (or any visually-hidden input) is actuated by
    // its wrapping/associated <label>, so the label is the effective tap
    // target — measure that, not the 16px visual box.
    const t = (el.getAttribute("type") || "").toLowerCase();
    const labelDriven =
      el.tagName === "INPUT" &&
      (isHidden(el) || t === "checkbox" || t === "radio");
    if (labelDriven) {
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
    if (el.disabled) continue; // disabled controls are non-interactive → exempt
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

  const tinyHard = []; // < fontHard (off-scale, real violation)
  const tinyInfo = []; // fontHard..fontFloor (sanctioned sub-floor tokens)
  const tseen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const direct = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.textContent.trim().length > 1,
    );
    if (!direct) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const fs = parseFloat(s.fontSize);
    if (!(fs < fontFloor - 0.5)) continue;
    const txt = el.textContent.trim().slice(0, 30);
    const key = Math.round(fs) + "|" + txt;
    if (tseen.has(key)) continue;
    tseen.add(key);
    const rec = { fontSizePx: Math.round(fs * 10) / 10, text: txt };
    (fs < fontHard - 0.1 ? tinyHard : tinyInfo).push(rec);
  }

  // M-001 — demo badge must not overlap the page header.
  let demoBadge = null;
  const badgeEl = [...document.querySelectorAll("button")].find((b) =>
    /Демо/i.test(b.textContent || ""),
  );
  if (badgeEl) {
    const br = badgeEl.getBoundingClientRect();
    const header = document.querySelector("header");
    const hr = header ? header.getBoundingClientRect() : null;
    const overlaps = hr
      ? !(
          br.right <= hr.left ||
          br.left >= hr.right ||
          br.bottom <= hr.top ||
          br.top >= hr.bottom
        )
      : null;
    demoBadge = {
      badge: {
        top: Math.round(br.top),
        bottom: Math.round(br.bottom),
        left: Math.round(br.left),
        right: Math.round(br.right),
      },
      header: hr
        ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom) }
        : null,
      overlapsHeader: overlaps,
    };
  }

  return {
    overflow,
    tooSmall,
    tinyHard,
    tinyInfo,
    demoBadge,
    scanned: document.querySelectorAll(SEL).length,
  };
}

async function login(page) {
  const res = await page.evaluate(async (creds) => {
    const r = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(creds),
    });
    return { status: r.status, body: (await r.text()).slice(0, 160) };
  }, CREDS);
  return res;
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = { mode: MODE, base: BASE, touchMin: TOUCH_MIN, devices: {} };

  for (const dev of DEVICES) {
    const context = await browser.newContext({ ...dev.descriptor });
    const page = await context.newPage();
    report.devices[dev.id] = {
      name: dev.name,
      viewport: dev.descriptor.viewport,
      routes: [],
    };

    await page
      .goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 })
      .catch(() => {});

    if (MODE === "authed") {
      const r = await login(page);
      report.devices[dev.id].login = r;
      console.log(`[${dev.id}] login → ${r.status}`);
    } else if (MODE === "demo") {
      await page
        .goto(BASE + "/?demo=1", {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        })
        .catch(() => {});
      await waitHydrated(page);
    }

    for (const route of ROUTES) {
      const entry = { id: route.id, path: route.path };
      try {
        await page.goto(BASE + route.path, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        entry.hydrate = await waitHydrated(page);
        const shot = `${OUT}/${MODE}-${dev.id}-${route.id}.png`;
        await page.screenshot({ path: shot, fullPage: false });
        entry.screenshot = shot;
        entry.audit = await page.evaluate(auditInPage, [
          TOUCH_MIN,
          FONT_HARD,
          FONT_FLOOR,
        ]);
        entry.url = page.url();
        const a = entry.audit;
        const ov = a.overflow ? ` OVERFLOW+${a.overflow.overflowBy}px` : "";
        const badge = a.demoBadge
          ? ` badge.overlapHdr=${a.demoBadge.overlapsHeader}`
          : "";
        console.log(
          `[${dev.id}] ${route.id.padEnd(10)} small=${a.tooSmall.length} <10px=${a.tinyHard.length} 10-11px=${a.tinyInfo.length}${ov}${badge}`,
        );
      } catch (err) {
        entry.error = String(err).slice(0, 200);
        console.log(`[${dev.id}] ${route.id.padEnd(10)} ERROR ${entry.error}`);
      }
      report.devices[dev.id].routes.push(entry);
    }
    await context.close();
  }

  await browser.close();
  await writeFile(
    `${OUT}/verify-${MODE}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(`\nReport → mobile-shots/verify-${MODE}.json`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
