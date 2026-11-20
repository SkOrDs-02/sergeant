#!/usr/bin/env node
/**
 * Генератор синтетичних чеків і скриншотів виписок для зорового стенду
 * (`pnpm eval:vision`, пайплайни `receipt-scan` і `statement-import`).
 *
 *   pnpm --filter @sergeant/server eval:vision:render
 *   pnpm --filter @sergeant/server eval:vision:render -- --out=/tmp/vision-docs
 *
 * HTML → зображення через Playwright (Chromium). Playwright НЕ є залежністю
 * сервера: генератор запускається вручну, коли змінились дані
 * `visionDocs.data.ts`, а результат комітиться у
 * `apps/server/src/__fixtures__/vision-eval/`. Стенд і тести читають готові
 * файли й Playwright не потребують.
 *
 * Чеки — JPEG (справжній чек приходить фотографією з камери), виписки — PNG
 * (скриншот екрана). Шум кейса «погане фото» — SVG `feTurbulence` з
 * фіксованим `seed`, тобто повторний прогін дає ті самі пікселі на тій самій
 * версії Chromium.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  CHAT_MESSAGES,
  FIXTURE_FILES,
  RECEIPTS,
  STATEMENTS,
  receiptTotal,
  type ReceiptDoc,
  type StatementDoc,
  type StatementRow,
} from "./visionDocs.data.js";

// ── Форматування ────────────────────────────────────────────────────

/** 123456 → «1 234,56» (нерозривний пробіл тисяч, кома копійок). */
function money(kop: number): string {
  const abs = Math.abs(kop);
  const hrn = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${hrn},${String(abs % 100).padStart(2, "0")}`;
}

function qtyText(qty: number, weighted?: boolean): string {
  return weighted
    ? `${qty.toFixed(3).replace(".", ",")} кг`
    : String(qty).replace(".", ",");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ── Чек ─────────────────────────────────────────────────────────────

function receiptHtml(doc: ReceiptDoc): string {
  const [y, m, d] = doc.date.split("-");
  const total = receiptTotal(doc);
  const vat = Math.round((total * 20) / 120);
  const lines = doc.lines
    .map((l, i) => {
      const unitRow = `${qtyText(l.qty, l.weighted)} x ${money(l.price)}`;
      const gross = Math.round(l.qty * l.price);
      const discount = l.discount
        ? `<div class="row"><span>  Знижка</span><span>-${money(l.discount)}</span></div>`
        : "";
      return `<div class="item" data-i="${i}">
        <div>${esc(l.name)}</div>
        <div class="row"><span>  ${unitRow}</span><span>${money(gross)} А</span></div>
        ${discount}
      </div>`;
    })
    .join("");
  const pay = doc.cashGiven
    ? `<div class="row"><span>ГОТІВКА</span><span>${money(doc.cashGiven)}</span></div>
       <div class="row"><span>РЕШТА</span><span>${money(doc.cashGiven - total)}</span></div>`
    : `<div class="row"><span>БЕЗГОТІВКОВА КАРТКА</span><span>${money(total)}</span></div>
       <div>Картка ****0000 ДЕМО</div>`;
  const discountSum = doc.lines.reduce((s, l) => s + (l.discount ?? 0), 0);
  return `<div id="doc" class="paper">
    <div class="c b">${esc(doc.store)}</div>
    <div class="c">${esc(doc.address)}</div>
    <div class="c">ТОВ «ДЕМО-ТОРГ»</div>
    <div class="c">ФН ДЕМО00001  ЗН ДЕМО-КАСА-1</div>
    <div class="dash"></div>
    ${lines}
    <div class="dash" id="totals"></div>
    ${discountSum ? `<div class="row"><span>ЗНИЖКА</span><span>-${money(discountSum)}</span></div>` : ""}
    <div class="row b big"><span>СУМА</span><span>${money(total)}</span></div>
    <div class="row"><span>ПДВ А 20%</span><span>${money(vat)}</span></div>
    ${pay}
    <div class="dash"></div>
    <div class="row"><span>ЧЕК № 4821</span><span>${d}.${m}.${y} ${doc.time}:07</span></div>
    <div class="c">ФІСКАЛЬНИЙ ЧЕК (ДЕМО)</div>
    <div class="c">Дякуємо за покупку!</div>
  </div>`;
}

const RECEIPT_CSS = `
  body { margin: 0; background: #fff; }
  .paper { width: 340px; padding: 18px 16px 26px; background: #fdfdf8;
    font: 14px/1.35 "DejaVu Sans Mono", monospace; color: #111; }
  .c { text-align: center; } .b { font-weight: bold; } .big { font-size: 17px; }
  .row { display: flex; justify-content: space-between; white-space: pre; }
  .dash { border-top: 1px dashed #333; margin: 6px 0; }
  .item { margin: 2px 0; }
`;

/**
 * «Погане фото»: стіл, нахил, перспективне стиснення, розмиття, низький
 * контраст і зерно. Стиснення JPEG робить решту.
 */
const PHOTO_BAD_CSS = `
  body { margin: 0; background: #6b5b4b; }
  .scene { padding: 40px 50px; background: radial-gradient(#8a7764, #4d4034); }
  .tilt { transform: rotate(-5deg) scale(0.94, 0.86) skewX(3deg);
    filter: blur(1.1px) contrast(0.45) brightness(1.1); }
  .paper { background: #ece6d6; color: #4a4a4a; box-shadow: 4px 6px 14px rgba(0,0,0,.5); }
  .grain { position: absolute; inset: 0; opacity: 0.22; mix-blend-mode: multiply; pointer-events: none; }
`;

// ── Виписка ─────────────────────────────────────────────────────────

const SIGN_MINUS = "−";

function rowAmount(r: StatementRow): string {
  const sym = r.currency === "EUR" ? "€" : r.currency === "USD" ? "$" : "₴";
  const sign = r.amount < 0 ? SIGN_MINUS : "+";
  return `${sign}${money(r.amount)} ${sym}`;
}

function appRowsHtml(doc: StatementDoc): string {
  let last = "";
  const out: string[] = [];
  doc.rows.forEach((r, i) => {
    if (r.shownDate !== last) {
      out.push(`<div class="day">${esc(r.shownDate)}</div>`);
      last = r.shownDate;
    }
    const cls = [
      "op",
      r.amount > 0 ? "in" : "",
      r.failed ? "failed" : "",
      r.amountHidden ? "hidden-amount" : "",
    ].join(" ");
    out.push(`<div class="${cls}" data-i="${i}">
      <div class="ico">${esc(r.description.replace(/[«»"]/g, "").charAt(0))}</div>
      <div class="mid"><div class="desc">${esc(r.description)}</div>
        <div class="sub${r.failed ? " err" : ""}">${esc(r.category ?? "")} · ${r.time ?? ""}</div></div>
      <div class="amt">${rowAmount(r)}</div>
    </div>`);
  });
  return out.join("");
}

function appHtml(doc: StatementDoc): string {
  const fab = doc.rows.some((r) => r.amountHidden)
    ? `<div class="fab">＋ Поповнити картку</div>`
    : "";
  return `<div id="doc" class="phone ${doc.style === "app-dark" ? "dark" : "light"}">
    <div class="status"><span>9:41</span><span>▂▄▆ 87%</span></div>
    <div class="head"><div class="bank">${esc(doc.bank)}</div>
      ${doc.balance ? `<div class="bal-l">Баланс</div><div class="bal">${esc(doc.balance)}</div>` : ""}
      <div class="lim">Кредитний ліміт 10 000,00 ₴ · Доступно ${doc.balance ? esc(doc.balance.split("·")[0] ?? "") : "—"}</div>
    </div>
    <div class="list">${appRowsHtml(doc)}</div>
    ${fab}
    <div class="tabs"><span>Головна</span><span>Операції</span><span>Платежі</span><span>Ще</span></div>
  </div>`;
}

const APP_CSS = `
  body { margin: 0; }
  .phone { width: 390px; position: relative; font: 15px/1.3 "DejaVu Sans", sans-serif; padding-bottom: 64px; }
  .light { background: #f3f4f7; color: #16181d; } .dark { background: #121317; color: #eceef3; }
  .status { display: flex; justify-content: space-between; padding: 10px 20px; font-size: 13px; }
  .head { padding: 6px 20px 16px; } .bank { font-weight: bold; font-size: 18px; }
  .bal-l { margin-top: 10px; font-size: 13px; opacity: .7; } .bal { font-size: 28px; font-weight: bold; }
  .lim { font-size: 12px; opacity: .6; margin-top: 4px; }
  .day { padding: 14px 20px 6px; font-size: 13px; font-weight: bold; opacity: .65; }
  .op { display: flex; align-items: center; gap: 12px; padding: 10px 20px; }
  .light .op { background: #fff; } .dark .op { background: #1c1e24; }
  .ico { width: 40px; height: 40px; border-radius: 20px; background: #9aa7c7; color: #fff;
    display: flex; align-items: center; justify-content: center; font-weight: bold; flex: none; }
  .mid { flex: 1; min-width: 0; } .desc { font-weight: 600; }
  .sub { font-size: 12px; opacity: .6; } .sub.err { color: #e5484d; opacity: 1; }
  .amt { font-weight: bold; white-space: nowrap; } .in .amt { color: #1f9d55; }
  .failed .amt { text-decoration: line-through; opacity: .45; }
  .fab { position: absolute; right: 12px; bottom: 76px; width: 230px; height: 56px; border-radius: 28px;
    background: #3b5bdb; color: #fff; font-weight: bold; display: flex; align-items: center;
    justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,.35); }
  .tabs { position: absolute; left: 0; right: 0; bottom: 0; height: 56px; display: flex;
    justify-content: space-around; align-items: center; font-size: 12px; border-top: 1px solid rgba(127,127,127,.3); }
  .light .tabs { background: #fff; } .dark .tabs { background: #1c1e24; }
`;

function tableHtml(doc: StatementDoc): string {
  let balance = 1_520_000;
  const rows = doc.rows
    .map((r) => {
      balance += r.amount;
      const sign = r.amount < 0 ? "-" : "+";
      return `<tr><td>${r.shownDate} ${r.time ?? ""}</td><td>${esc(r.description)}</td>
        <td class="n">${sign}${money(r.amount)}</td><td class="n">${money(balance)}</td></tr>`;
    })
    .join("");
  return `<div id="doc" class="sheet">
    <div class="t">${esc(doc.bank)} · Виписка по картці •• 0000</div>
    <div class="p">Період: 01.11.2026 – 12.11.2026 · Валюта рахунку: UAH</div>
    <table><thead><tr><th>Дата і час</th><th>Опис операції</th><th>Сума, грн</th><th>Залишок, грн</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="p">Вхідний залишок: 15 200,00 · Вихідний залишок: ${money(balance)}</div>
  </div>`;
}

const TABLE_CSS = `
  body { margin: 0; background: #fff; }
  .sheet { width: 760px; padding: 20px; font: 13px/1.35 "Liberation Sans", sans-serif; color: #111; }
  .t { font-size: 17px; font-weight: bold; } .p { margin: 6px 0; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e8ebf0; } .n { text-align: right; white-space: nowrap; }
`;

function chatHtml(): string {
  const bubbles = CHAT_MESSAGES.map(
    (m) =>
      `<div class="b ${m.me ? "me" : "they"}">${esc(m.text)}<span class="tm">${m.time}</span></div>`,
  ).join("");
  return `<div id="doc" class="chat">
    <div class="status"><span>19:08</span><span>▂▄▆ 64%</span></div>
    <div class="top"><b>Марта (демо)</b><div class="on">в мережі</div></div>
    <div class="msgs">${bubbles}</div>
    <div class="input">Повідомлення…</div>
  </div>`;
}

const CHAT_CSS = `
  body { margin: 0; }
  .chat { width: 390px; background: #dfe8d8; font: 15px/1.35 "DejaVu Sans", sans-serif; color: #111; }
  .status { display: flex; justify-content: space-between; padding: 10px 20px; font-size: 13px; background: #fff; }
  .top { padding: 8px 20px 10px; background: #fff; border-bottom: 1px solid #ccc; } .on { font-size: 12px; color: #2b8a3e; }
  .msgs { padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 520px; }
  .b { max-width: 75%; padding: 8px 10px; border-radius: 12px; }
  .they { background: #fff; align-self: flex-start; } .me { background: #c9f0b5; align-self: flex-end; }
  .tm { font-size: 11px; color: #777; margin-left: 8px; }
  .input { margin: 8px; padding: 10px 14px; border-radius: 20px; background: #fff; color: #999; }
`;

// ── Рендер ──────────────────────────────────────────────────────────

interface PwPage {
  setContent(html: string): Promise<void>;
  locator(sel: string): {
    screenshot(o: Record<string, unknown>): Promise<Buffer>;
    boundingBox(): Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>;
  };
  evaluate<T>(fn: string): Promise<T>;
  screenshot(o: Record<string, unknown>): Promise<Buffer>;
  close(): Promise<void>;
}
interface PwBrowser {
  newPage(o: Record<string, unknown>): Promise<PwPage>;
  close(): Promise<void>;
}

function page(css: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

const GRAIN_SVG = `<svg class="grain" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <filter id="g"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/>
  <feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#g)"/></svg>`;

async function renderReceipt(
  browser: PwBrowser,
  doc: ReceiptDoc,
): Promise<Buffer> {
  const p = await browser.newPage({
    viewport: { width: 520, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    if (doc.style === "photo-bad") {
      await p.setContent(
        page(
          RECEIPT_CSS + PHOTO_BAD_CSS,
          `<div class="scene" id="scene" style="position:relative">
          <div class="tilt">${receiptHtml(doc)}</div>${GRAIN_SVG}</div>`,
        ),
      );
      return await p
        .locator("#scene")
        .screenshot({ type: "jpeg", quality: 42 });
    }
    await p.setContent(page(RECEIPT_CSS, receiptHtml(doc)));
    if (doc.style === "cut") {
      // Обрізаємо посеред шостої позиції: частина позицій і весь підсумок
      // лишаються поза кадром, тож сума видимих ≠ справжній підсумок.
      const box = await p.locator("#doc").boundingBox();
      const cutAt = await p.evaluate<number>(
        `(() => { const el = document.querySelector('.item[data-i="5"]'); const r = el.getBoundingClientRect(); return r.top + r.height * 0.45; })()`,
      );
      if (!box) throw new Error("немає #doc");
      return await p.screenshot({
        type: "jpeg",
        quality: 80,
        clip: { x: box.x, y: box.y, width: box.width, height: cutAt - box.y },
      });
    }
    return await p.locator("#doc").screenshot({ type: "jpeg", quality: 80 });
  } finally {
    await p.close();
  }
}

async function renderPng(
  browser: PwBrowser,
  css: string,
  body: string,
  width: number,
): Promise<Buffer> {
  const p = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    await p.setContent(page(css, body));
    return await p.locator("#doc").screenshot({ type: "png" });
  } finally {
    await p.close();
  }
}

export async function renderAll(outDir: string): Promise<string[]> {
  // Рядок замість літерала: Playwright не є залежністю воркспейсу, і `tsc`
  // не мусить його резолвити.
  const moduleName = "playwright";
  const pw = (await import(moduleName)) as {
    chromium: { launch(): Promise<PwBrowser> };
  };
  mkdirSync(outDir, { recursive: true });
  const browser = await pw.chromium.launch();
  const written: string[] = [];
  try {
    for (const doc of RECEIPTS) {
      const buf = await renderReceipt(browser, doc);
      const file = resolve(outDir, FIXTURE_FILES.receipt(doc.key));
      writeFileSync(file, buf);
      written.push(file);
    }
    for (const doc of STATEMENTS) {
      const [css, body, width] =
        doc.style === "table"
          ? [TABLE_CSS, tableHtml(doc), 800]
          : [APP_CSS, appHtml(doc), 390];
      const file = resolve(outDir, FIXTURE_FILES.statement(doc.key));
      writeFileSync(file, await renderPng(browser, css, body, width));
      written.push(file);
    }
    const chatFile = resolve(outDir, FIXTURE_FILES.chat);
    writeFileSync(
      chatFile,
      await renderPng(browser, CHAT_CSS, chatHtml(), 390),
    );
    written.push(chatFile);
  } finally {
    await browser.close();
  }
  return written;
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { values } = parseArgs({ options: { out: { type: "string" } } });
  const outDir = resolve(
    values.out ??
      fileURLToPath(
        new URL("../../src/__fixtures__/vision-eval/", import.meta.url),
      ),
  );
  renderAll(outDir)
    .then((files) => {
      for (const f of files) console.log(f);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
