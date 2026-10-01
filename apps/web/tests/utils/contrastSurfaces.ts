/**
 * Вимірювач контрасту і «пласких» поверхонь для аудиту WCAG AA
 * (рішення власника 2026-10-01: 4.5:1 для тексту, 3:1 для меж компонентів,
 * іконок і індикаторів фокусу).
 *
 * Status: Active — інструмент аудиту, не CI-гейт сам по собі. Гейт, що
 * спирається на ці ж метрики, — `tests/a11y/contrast-surfaces.audit.ts`.
 *
 * ВСЕ, що виконується у браузері, живе всередині `measureInPage` і не має
 * права посилатись на зовнішні імпорти/константи: Playwright серіалізує
 * функцію цілком (`page.evaluate`), тож хелпери вкладені.
 *
 * ## Метрики (визначення, щоб замір можна було повторити)
 *
 * Усі коефіцієнти — WCAG 2.x: (L1 + 0.05) / (L2 + 0.05), L — відносна
 * світлота sRGB. Напівпрозорі шари складаються «source-over» по ланцюжку
 * предків від кореня до вузла; `opacity` предків множиться на альфу шару.
 * Фон із `background-image` (градієнти) НЕ рахується — вузол позначається
 * `uncertain` і виключається з вердиктів (axe теж віддає їх в `incomplete`).
 *
 *   text      — fg(element) над effBg(element) проти 4.5 (3.0 для великого:
 *               ≥24px, або ≥18.66px і вага ≥700). Другий незалежний прохід
 *               поряд з axe: він не бачить перекриття, зате дає ЧИСЛО для
 *               кожного вузла, а не лише вердикт.
 *   field     — input/textarea/select: max(border vs parentBg, fill vs
 *               parentBg) проти 3.0 (WCAG 1.4.11: межа потрібна, щоб
 *               впізнати компонент).
 *   toggle    — role=switch / checkbox / radio: те саме, але по доріжці
 *               (трек) — найближчий візуальний бокс (`label`/`span` поруч).
 *   icon      — іконкова кнопка (немає видимого тексту, є svg/img):
 *               колір значка проти effBg кнопки, поріг 3.0.
 *   state     — selected (aria-selected/pressed/checked) чип/вкладка:
 *               max(fill vs parentBg, fill vs неактивного брата,
 *               border vs parentBg) проти 3.0 — відмінність стану.
 *   control   — рамка/заливка підписаної кнопки або чипа (advisory: текст
 *               уже ідентифікує компонент, тож це НЕ порушення WCAG, а
 *               дизайн-сигнал «чи читається форма кнопки»).
 *   focus     — Tab по сторінці; на кожному зупинці: товщина і колір кільця
 *               (box-shadow ring / outline), складений з parentBg; поріг
 *               3.0 (WCAG 1.4.11 до індикатора фокусу).
 *   surface   — «картка»: видимий бокс ≥100×40, радіус ≥6px, власна заливка
 *               або межа або тінь. S = max(fillRatio, borderRatio,
 *               shadowRatio). shadowRatio — суворий верхній ліміт: колір
 *               найсильнішої зовнішньої тіні (альфа × колір) над parentBg
 *               проти parentBg, БЕЗ врахування розмиття (реальний край
 *               світліший). Клас: S<1.10 «flat» · 1.10–1.20 «weak» ·
 *               ≥1.20 «ok». Поріг 1.2 — той, яким репо вже обґрунтувало
 *               щаблі поверхонь темної теми (theme.css, крок 2 D1).
 */

export interface MeasureOptions {
  /** CSS-селектор кореня вимірювання (для шторок — `[role="dialog"]`). */
  scope?: string | undefined;
  /** Додатково заміряти вузли в межах viewport-а, а не всю сторінку. */
  viewportOnly?: boolean | undefined;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface NodeRef {
  /** `tag.class1.class2` + `[aria-label|data-testid]`. */
  sel: string;
  /** Повний `class` (до 240 символів) — з нього виводиться токен. */
  cls: string;
  /** Видимий текст (до 40 символів) або accessible name. */
  txt: string;
  /** Прямокутник у координатах документа. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface TextFinding extends NodeRef {
  kind: "text";
  ratio: number;
  required: number;
  fg: string;
  bg: string;
  fontPx: number;
  weight: number;
  opacityChain: number;
  uncertain: boolean;
  /**
   * Лише для `uncertain` (текст на градієнті): найгірший коефіцієнт проти
   * кожної зупинки градієнта. Нижня межа, а не вердикт: сам градієнт між
   * зупинками не семплюється.
   */
  gradMin: number | null;
}

export interface BoundaryFinding extends NodeRef {
  kind: "field" | "toggle" | "icon" | "state" | "control";
  /** Найкращий із доступних коефіцієнтів, що доводить межу/значок. */
  ratio: number;
  required: number;
  detail: Record<string, string | number | boolean | null>;
  uncertain: boolean;
}

export interface FocusFinding extends NodeRef {
  kind: "focus";
  /** `ring` | `ring-inset` | `outline` | `ua-auto` (браузерний дефолт) | `none`. */
  mechanism: string;
  /** Сирі `box-shadow` / `outline` для розбору. */
  raw: string;
  ringPx: number;
  ratio: number | null;
  required: number;
  ringColor: string | null;
  parentBg: string;
  uncertain: boolean;
}

export interface SurfaceFinding extends NodeRef {
  kind: "surface";
  fillRatio: number;
  borderRatio: number | null;
  borderPx: number;
  shadowRatio: number | null;
  /** Нормалізований рядок `box-shadow` (обрізаний). */
  shadow: string;
  S: number;
  grade: "flat" | "weak" | "ok";
  fill: string;
  parentBg: string;
  isBar: boolean;
  uncertain: boolean;
}

export interface PageMeasure {
  text: TextFinding[];
  boundary: BoundaryFinding[];
  surfaces: SurfaceFinding[];
  counts: Record<string, number>;
  bodyBg: string;
  scrollHeight: number;
}

/**
 * Один самодостатній прохід. Повертає лише СИРІ виміри; класифікацію й
 * агрегацію робить `summarize` на боці Node.
 */
export function measureInPage(opts: MeasureOptions): PageMeasure {
  type RGBA = { r: number; g: number; b: number; a: number };

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function parse(raw: string): RGBA {
    const c = (raw || "").trim();
    if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m && m[1]) {
      const p = m[1]
        .replace(/\//g, " ")
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(parseFloat);
      return {
        r: p[0] ?? 0,
        g: p[1] ?? 0,
        b: p[2] ?? 0,
        a: p.length > 3 ? (p[3] ?? 1) : 1,
      };
    }
    m = c.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m && m[1]) {
      const p = m[1]
        .replace(/\//g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map(parseFloat);
      return {
        r: (p[0] ?? 0) * 255,
        g: (p[1] ?? 0) * 255,
        b: (p[2] ?? 0) * 255,
        a: p.length > 3 ? (p[3] ?? 1) : 1,
      };
    }
    if (!ctx) return { r: 0, g: 0, b: 0, a: 0 };
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
  }

  function over(top: RGBA, bottom: RGBA): RGBA {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  }

  function lum(c: RGBA | Rgb): number {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function ratio(a: RGBA | Rgb, b: RGBA | Rgb): number {
    const l1 = lum(a);
    const l2 = lum(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function hex(c: RGBA | Rgb): string {
    const h = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const bgCache = new WeakMap<Element, { c: RGBA; u: boolean; op: number }>();
  /** Складений фон ВКЛЮЧНО з власним (self=true) або БЕЗ нього (self=false). */
  function effBg(el: Element, self: boolean) {
    const target: Element | null = self ? el : el.parentElement;
    if (!target)
      return { c: { r: 255, g: 255, b: 255, a: 1 }, u: false, op: 1 };
    const cached = bgCache.get(target);
    if (cached) return cached;
    const chain: Element[] = [];
    let n: Element | null = target;
    while (n) {
      chain.push(n);
      n = n.parentElement;
    }
    chain.reverse();
    let acc: RGBA = { r: 255, g: 255, b: 255, a: 1 };
    let cum = 1;
    let uncertain = false;
    for (const node of chain) {
      const cs = getComputedStyle(node);
      const op = parseFloat(cs.opacity);
      cum *= Number.isNaN(op) ? 1 : op;
      const bg = parse(cs.backgroundColor);
      if (bg.a > 0) acc = over({ ...bg, a: bg.a * cum }, acc);
      // Непрозора заливка ближче до вузла повністю перекриває градієнт
      // вище по ланцюжку (кнопка на геро-картці): тоді фон відомий.
      if (bg.a * cum >= 0.99) uncertain = false;
      if (cs.backgroundImage !== "none") uncertain = true;
    }
    const out = { c: acc, u: uncertain, op: cum };
    bgCache.set(target, out);
    return out;
  }

  /** Найгірший коефіцієнт `fg` проти зупинок найближчого градієнта-предка. */
  function gradientWorst(el: Element, fgRaw: RGBA): number | null {
    let n: Element | null = el;
    while (n) {
      const cs = getComputedStyle(n);
      if (/gradient\(/.test(cs.backgroundImage)) {
        const stops =
          cs.backgroundImage.match(
            /(?:rgba?|oklab|oklch|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}/gi,
          ) ?? [];
        if (stops.length === 0) return null;
        const base = effBg(n, false).c;
        let worst = Infinity;
        for (const st of stops) {
          const c = over(parse(st), base);
          const fg = over({ ...fgRaw, a: fgRaw.a * effBg(el, true).op }, c);
          worst = Math.min(worst, ratio(fg, c));
        }
        return worst === Infinity ? null : worst;
      }
      n = n.parentElement;
    }
    return null;
  }

  function visible(el: Element, minW = 4, minH = 4): DOMRect | null {
    const cs = getComputedStyle(el);
    if (
      cs.display === "none" ||
      cs.visibility !== "visible" ||
      parseFloat(cs.opacity) === 0
    )
      return null;
    const r = el.getBoundingClientRect();
    if (r.width < minW || r.height < minH) return null;
    // Невидимі дублі (ghost-шар `opacity-0` у предка) не міряємо.
    if (effBg(el, true).op < 0.05) return null;
    if (opts.viewportOnly) {
      if (r.bottom < 0 || r.top > innerHeight) return null;
    }
    return r;
  }

  function ref(el: Element, r: DOMRect): NodeRef {
    const cls = (el.getAttribute("class") || "").replace(/\s+/g, " ").trim();
    const first = cls
      .split(" ")
      .filter(Boolean)
      .slice(0, 4)
      .map((c) => `.${c}`)
      .join("");
    const extra =
      el.getAttribute("aria-label") || el.getAttribute("data-testid") || "";
    const txt = (
      (el as HTMLElement).innerText ||
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
    return {
      sel: `${el.tagName.toLowerCase()}${first}${extra ? `[${extra.slice(0, 30)}]` : ""}`,
      cls: cls.slice(0, 240),
      txt,
      rect: {
        x: Math.round(r.left + scrollX),
        y: Math.round(r.top + scrollY),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
    };
  }

  const root: Element =
    (opts.scope ? document.querySelector(opts.scope) : null) ?? document.body;

  const text: TextFinding[] = [];
  const boundary: BoundaryFinding[] = [];
  const surfaces: SurfaceFinding[] = [];
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  /* ───────────── text ───────────── */
  const seenText = new Set<Element>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let tn: Node | null;
  while ((tn = walker.nextNode())) {
    if (!tn.nodeValue || !tn.nodeValue.trim()) continue;
    const el = tn.parentElement;
    if (!el || seenText.has(el)) continue;
    if (el.closest("script,style,noscript,svg")) continue;
    seenText.add(el);
    const r = visible(el, 2, 2);
    if (!r) continue;
    const cs = getComputedStyle(el);
    // disabled-контроли WCAG виводить із вимог до контрасту.
    if (el.closest(":disabled,[aria-disabled='true']")) continue;
    const bg = effBg(el, true);
    const fgRaw = parse(cs.color);
    const fg = over({ ...fgRaw, a: fgRaw.a * bg.op }, bg.c);
    const fontPx = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = fontPx >= 24 || (fontPx >= 18.66 && weight >= 700);
    const required = large ? 3 : 4.5;
    const ra = ratio(fg, bg.c);
    bump("textNodes");
    text.push({
      kind: "text",
      ...ref(el, r),
      ratio: r2(ra),
      required,
      fg: hex(fg),
      bg: hex(bg.c),
      fontPx: r2(fontPx),
      weight,
      opacityChain: r2(bg.op),
      uncertain: bg.u,
      gradMin: bg.u
        ? (() => {
            const g = gradientWorst(el, fgRaw);
            return g === null ? null : r2(g);
          })()
        : null,
    });
  }

  /* ───────────── межі/значки/стани ───────────── */
  function sideBorder(cs: CSSStyleDeclaration) {
    const sides = ["Top", "Right", "Bottom", "Left"] as const;
    let best = { w: 0, color: "transparent" };
    for (const s of sides) {
      const style = cs.getPropertyValue(`border-${s.toLowerCase()}-style`);
      const w = parseFloat(
        cs.getPropertyValue(`border-${s.toLowerCase()}-width`),
      );
      if (style === "none" || style === "hidden" || !(w > 0)) continue;
      const color = cs.getPropertyValue(`border-${s.toLowerCase()}-color`);
      // Прозора межа (`border-transparent`) не є межею: інакше кожна
      // невибрана вкладка/кнопка з `border` рахувалась би «пласкою карткою».
      if (parse(color).a <= 0.02) continue;
      if (w > best.w) best = { w, color };
    }
    return best;
  }

  function boundaryOf(el: Element) {
    const cs = getComputedStyle(el);
    const outside = effBg(el, false);
    const fill = effBg(el, true);
    const b = sideBorder(cs);
    const bcol = parse(b.color);
    const borderEff =
      b.w > 0 && bcol.a > 0
        ? over({ ...bcol, a: bcol.a * fill.op }, fill.c)
        : null;
    return {
      cs,
      outside,
      fill,
      borderPx: b.w,
      borderRatio: borderEff ? ratio(borderEff, outside.c) : null,
      fillRatio: ratio(fill.c, outside.c),
      uncertain: outside.u || fill.u,
    };
  }

  /** Видимий «корпус» контрола: сам елемент, а якщо в нього немає власної
   *  заливки чи межі — найбільший нащадок (≥60% площі) із заливкою/межею
   *  (піл активного пункту нижньої навігації, чип у `<button>`-обгортці). */
  function visualBox(el: Element): Element {
    const cs0 = getComputedStyle(el);
    if (parse(cs0.backgroundColor).a > 0.05 || sideBorder(cs0).w > 0) return el;
    const r0 = el.getBoundingClientRect();
    const area0 = r0.width * r0.height;
    let best: Element = el;
    let bestArea = 0;
    for (const d of Array.from(el.querySelectorAll("*"))) {
      const dr = d.getBoundingClientRect();
      const a = dr.width * dr.height;
      if (a < area0 * 0.6 || a < bestArea) continue;
      const cs = getComputedStyle(d);
      if (parse(cs.backgroundColor).a > 0.05 || sideBorder(cs).w > 0) {
        best = d;
        bestArea = a;
      }
    }
    return best;
  }

  const FIELD_SEL =
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),textarea,select";
  /** Видима межа поля: сам `input`, а якщо він «голий» усередині обгортки
   *  (`TimeField`/`DateField`: контур малює контейнер) — найближчий предок
   *  (≤2 рівні), який має межу й майже повністю збігається з полем за площею. */
  function fieldBox(el: Element): Element {
    const own = boundaryOf(el);
    if (own.borderPx > 0 || own.fillRatio > 1.02) return el;
    const r0 = el.getBoundingClientRect();
    let n: Element | null = el.parentElement;
    for (let i = 0; i < 4 && n; i++, n = n.parentElement) {
      const cs = getComputedStyle(n);
      const rn = n.getBoundingClientRect();
      if (
        sideBorder(cs).w > 0 &&
        r0.width * r0.height >= 0.5 * rn.width * rn.height
      )
        return n;
    }
    return el;
  }

  for (const el of Array.from(root.querySelectorAll(FIELD_SEL))) {
    const r = visible(el, 8, 8);
    if (!r) continue;
    const m = boundaryOf(fieldBox(el));
    const best = Math.max(m.fillRatio, m.borderRatio ?? 1);
    bump("field");
    boundary.push({
      kind: "field",
      ...ref(el, r),
      ratio: r2(best),
      required: 3,
      uncertain: m.uncertain,
      detail: {
        borderRatio: m.borderRatio === null ? null : r2(m.borderRatio),
        fillRatio: r2(m.fillRatio),
        borderPx: m.borderPx,
        fill: hex(m.fill.c),
        parentBg: hex(m.outside.c),
        boxShadow: m.cs.boxShadow.slice(0, 120),
      },
    });
  }

  const TOGGLE_SEL =
    "[role=switch],input[type=checkbox],input[type=radio],[role=checkbox],[role=radio]";
  for (const el of Array.from(root.querySelectorAll(TOGGLE_SEL))) {
    // Візуальний трек: сам елемент, якщо видимий, інакше сусідній бокс
    // (`sr-only` input + `label > span` трек у `Switch`).
    let box: Element | null = el;
    let r = visible(el, 8, 8);
    if (!r || getComputedStyle(el).opacity === "0") {
      const label =
        (el as HTMLInputElement).labels?.[0] ?? el.nextElementSibling;
      const cand =
        label?.querySelector("span[aria-hidden]") ??
        label?.firstElementChild ??
        label ??
        null;
      box = cand;
      r = cand ? visible(cand, 8, 8) : null;
    }
    if (!box || !r) continue;
    const m = boundaryOf(box);
    const checked =
      (el as HTMLInputElement).checked === true ||
      el.getAttribute("aria-checked") === "true";
    const best = Math.max(m.fillRatio, m.borderRatio ?? 1);
    bump("toggle");
    boundary.push({
      kind: "toggle",
      ...ref(box, r),
      ratio: r2(best),
      required: 3,
      uncertain: m.uncertain,
      detail: {
        checked,
        role: el.getAttribute("role") ?? (el as HTMLInputElement).type ?? "",
        borderRatio: m.borderRatio === null ? null : r2(m.borderRatio),
        fillRatio: r2(m.fillRatio),
        fill: hex(m.fill.c),
        parentBg: hex(m.outside.c),
      },
    });
  }

  const BTN_SEL = "button,a[href],[role=button],[role=tab],[role=menuitem]";
  const seenIconCtl = new Set<Element>();
  for (const el of Array.from(root.querySelectorAll(BTN_SEL))) {
    if (seenIconCtl.has(el)) continue;
    seenIconCtl.add(el);
    const r = visible(el, 8, 8);
    if (!r) continue;
    if (el.closest(":disabled,[aria-disabled='true']")) continue;
    const label = ((el as HTMLElement).innerText || "").replace(/\s+/g, "");
    const svg = el.querySelector("svg, img");
    const m = boundaryOf(visualBox(el));
    const selected =
      el.getAttribute("aria-selected") === "true" ||
      el.getAttribute("aria-pressed") === "true" ||
      el.getAttribute("aria-checked") === "true" ||
      el.getAttribute("aria-current") === "page";

    if (!label && svg) {
      // Іконкова кнопка: значок проти фону кнопки.
      const scs = getComputedStyle(svg);
      const stroke = parse(scs.stroke);
      const fillC = parse(scs.fill);
      const colorC = parse(scs.color);
      const iconRaw =
        svg.tagName.toLowerCase() === "img"
          ? colorC
          : stroke.a > 0 && scs.stroke !== "none"
            ? stroke
            : fillC.a > 0 && scs.fill !== "none"
              ? fillC
              : colorC;
      const behind = effBg(svg, true);
      const icon = over({ ...iconRaw, a: iconRaw.a * behind.op }, behind.c);
      bump("icon");
      boundary.push({
        kind: "icon",
        ...ref(el, r),
        ratio: r2(ratio(icon, behind.c)),
        required: 3,
        uncertain: behind.u,
        detail: {
          icon: hex(icon),
          bg: hex(behind.c),
          boxPx: `${Math.round(r.width)}x${Math.round(r.height)}`,
        },
      });
    }

    if (selected) {
      // Відмінність стану: заливка/межа активного проти фону і брата.
      const sibs = el.parentElement
        ? Array.from(el.parentElement.children).filter((s) => s !== el)
        : [];
      let sibRatio: number | null = null;
      for (const s of sibs) {
        if (!visible(s, 8, 8)) continue;
        const sf = effBg(s, true);
        sibRatio = Math.max(sibRatio ?? 1, ratio(m.fill.c, sf.c));
      }
      const best = Math.max(m.fillRatio, m.borderRatio ?? 1, sibRatio ?? 1);
      bump("state");
      boundary.push({
        kind: "state",
        ...ref(el, r),
        ratio: r2(best),
        required: 3,
        uncertain: m.uncertain,
        detail: {
          fillRatio: r2(m.fillRatio),
          borderRatio: m.borderRatio === null ? null : r2(m.borderRatio),
          siblingRatio: sibRatio === null ? null : r2(sibRatio),
          fill: hex(m.fill.c),
          parentBg: hex(m.outside.c),
        },
      });
    } else if (label) {
      // Підписана кнопка/чип: advisory-сигнал про читабельність форми.
      const hasShape = m.borderPx > 0 || m.fillRatio > 1.02;
      if (!hasShape) continue;
      bump("control");
      boundary.push({
        kind: "control",
        ...ref(el, r),
        ratio: r2(Math.max(m.fillRatio, m.borderRatio ?? 1)),
        required: 3,
        uncertain: m.uncertain,
        detail: {
          fillRatio: r2(m.fillRatio),
          borderRatio: m.borderRatio === null ? null : r2(m.borderRatio),
          borderPx: m.borderPx,
          fill: hex(m.fill.c),
          parentBg: hex(m.outside.c),
        },
      });
    }
  }

  /* ───────────── поверхні ───────────── */
  function parseShadow(raw: string) {
    if (!raw || raw === "none") return [];
    // Розбиваємо по комах поза дужками.
    const parts: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of raw) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((p) => {
      const inset = /\binset\b/.test(p);
      const colorM = p.match(
        /((?:rgba?|oklab|oklch|lab|lch|hsla?|color)\([^)]*\)|#[0-9a-f]{3,8})/i,
      );
      const rest = p.replace(colorM?.[0] ?? "", "").replace(/\binset\b/, "");
      const nums = (rest.match(/-?\d*\.?\d+(?=px)/g) ?? []).map(parseFloat);
      return {
        inset,
        color: colorM ? parse(colorM[0]) : { r: 0, g: 0, b: 0, a: 0 },
        x: nums[0] ?? 0,
        y: nums[1] ?? 0,
        blur: nums[2] ?? 0,
        spread: nums[3] ?? 0,
      };
    });
  }

  const vw = innerWidth;
  const vh = innerHeight;
  const all = root.querySelectorAll("*");
  const candidates: Element[] = [];
  for (const el of Array.from(all)) {
    if (el.closest("svg")) continue;
    const tag = el.tagName.toLowerCase();
    if (["html", "body", "script", "style", "svg", "path"].includes(tag))
      continue;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 40) continue;
    // Повноекранні обгортки сторінки не є «карткою».
    if (r.width >= vw - 1 && r.height >= vh * 0.9) continue;
    candidates.push(el);
  }
  for (const el of candidates) {
    const r = visible(el, 100, 40);
    if (!r) continue;
    const cs = getComputedStyle(el);
    const radius = Math.max(
      parseFloat(cs.borderTopLeftRadius) || 0,
      parseFloat(cs.borderTopRightRadius) || 0,
    );
    if (radius < 6) continue;
    const m = boundaryOf(el);
    const shadows = parseShadow(cs.boxShadow).filter(
      (s) => !s.inset && s.color.a > 0 && s.blur + Math.abs(s.spread) > 0,
    );
    const hasOwnFill = parse(cs.backgroundColor).a > 0.02;
    if (!hasOwnFill && m.borderPx === 0 && shadows.length === 0) continue;
    // Прозорі «обгортки» з контуром без заливки лишаємо; але порожні
    // декоративні боксі (без тексту/контролів) пропускаємо.
    if (
      !(el as HTMLElement).innerText?.trim() &&
      !el.querySelector("button,a,input,svg,img")
    )
      continue;
    let shadowRatio: number | null = null;
    for (const s of shadows) {
      const sc = over({ ...s.color, a: s.color.a * m.outside.op }, m.outside.c);
      const rr = ratio(sc, m.outside.c);
      shadowRatio = Math.max(shadowRatio ?? 1, rr);
    }
    const S = Math.max(m.fillRatio, m.borderRatio ?? 1, shadowRatio ?? 1);
    const pos = cs.position;
    const isBar = pos === "fixed" || pos === "sticky";
    bump("surface");
    surfaces.push({
      kind: "surface",
      ...ref(el, r),
      fillRatio: r2(m.fillRatio),
      borderRatio: m.borderRatio === null ? null : r2(m.borderRatio),
      borderPx: m.borderPx,
      shadowRatio: shadowRatio === null ? null : r2(shadowRatio),
      shadow: cs.boxShadow.slice(0, 160),
      S: r2(S),
      grade: S < 1.1 ? "flat" : S < 1.2 ? "weak" : "ok",
      fill: hex(m.fill.c),
      parentBg: hex(m.outside.c),
      isBar,
      uncertain: m.uncertain,
    });
  }

  return {
    text,
    boundary,
    surfaces,
    counts,
    bodyBg: hex(effBg(document.body, true).c),
    scrollHeight: document.documentElement.scrollHeight,
  };
}

/**
 * Індикатор фокусу для поточного `document.activeElement`. Викликається
 * ПІСЛЯ `keyboard.press("Tab")`, щоб `:focus-visible` був активний.
 */
export function measureFocusInPage(): FocusFinding | null {
  type RGBA = { r: number; g: number; b: number; a: number };
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement)
    return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  function parse(raw: string): RGBA {
    const c = (raw || "").trim();
    if (!c || c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    let m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m && m[1]) {
      const p = m[1]
        .replace(/\//g, " ")
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(parseFloat);
      return {
        r: p[0] ?? 0,
        g: p[1] ?? 0,
        b: p[2] ?? 0,
        a: p.length > 3 ? (p[3] ?? 1) : 1,
      };
    }
    m = c.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m && m[1]) {
      const p = m[1]
        .replace(/\//g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map(parseFloat);
      return {
        r: (p[0] ?? 0) * 255,
        g: (p[1] ?? 0) * 255,
        b: (p[2] ?? 0) * 255,
        a: p.length > 3 ? (p[3] ?? 1) : 1,
      };
    }
    if (!ctx) return { r: 0, g: 0, b: 0, a: 0 };
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0] ?? 0, g: d[1] ?? 0, b: d[2] ?? 0, a: (d[3] ?? 0) / 255 };
  }
  function over(top: RGBA, bottom: RGBA): RGBA {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a,
    };
  }
  function lum(c: RGBA): number {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function ratio(a: RGBA, b: RGBA): number {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function hex(c: RGBA): string {
    const h = (v: number) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0");
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  function parentBgOf(node: Element) {
    const chain: Element[] = [];
    let n: Element | null = node.parentElement;
    while (n) {
      chain.push(n);
      n = n.parentElement;
    }
    chain.reverse();
    let acc: RGBA = { r: 255, g: 255, b: 255, a: 1 };
    let cum = 1;
    let u = false;
    for (const x of chain) {
      const cs = getComputedStyle(x);
      const op = parseFloat(cs.opacity);
      cum *= Number.isNaN(op) ? 1 : op;
      const bg = parse(cs.backgroundColor);
      if (bg.a > 0) acc = over({ ...bg, a: bg.a * cum }, acc);
      if (bg.a * cum >= 0.99) u = false;
      if (cs.backgroundImage !== "none") u = true;
    }
    return { c: acc, u };
  }
  function ownFill(node: Element, base: RGBA): RGBA {
    const bg = parse(getComputedStyle(node).backgroundColor);
    return bg.a > 0 ? over(bg, base) : base;
  }
  /**
   * Фон «під» елементом, коли найближчий предок із заливкою — ГРАДІЄНТ
   * (hero-картка). Плаский `parentBg` там бреше: кільце кольору градієнта
   * (`#115e59` на `#115e59 → #0f766e`) виглядало як 6:1 проти столу, хоча
   * на екрані зливалось із фоном (follow-up аудиту 2026-10-01). Повертає
   * зупинки градієнта, складені на плаский фон; `null` — градієнта немає.
   */
  function gradientBackdrops(node: Element, base: RGBA): RGBA[] | null {
    let n: Element | null = node.parentElement;
    while (n) {
      const bi = getComputedStyle(n).backgroundImage;
      if (/gradient\(/.test(bi)) {
        const stops =
          bi.match(
            /(?:rgba?|oklab|oklch|lab|lch|color)\([^)]*\)|#[0-9a-f]{3,8}/gi,
          ) ?? [];
        return stops.length > 0 ? stops.map((s) => over(parse(s), base)) : null;
      }
      n = n.parentElement;
    }
    return null;
  }
  /**
   * Найгірший коефіцієнт `fg` проти кожного можливого фону під елементом:
   * кожна зупинка градієнта-предка або (якщо градієнта нема) плаский фон.
   * `fill` — власна (можливо напівпрозора) заливка елемента, що лежить
   * поверх цього фону; без неї фон і є сусідом кільця.
   */
  function worstOver(fg: RGBA, backdrops: RGBA[], fill?: RGBA): number {
    return Math.min(
      ...backdrops.map((b) =>
        ratio(fg, fill && fill.a > 0 ? over(fill, b) : b),
      ),
    );
  }

  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const cls = (el.getAttribute("class") || "").replace(/\s+/g, " ").trim();
  const first = cls
    .split(" ")
    .filter(Boolean)
    .slice(0, 4)
    .map((c) => `.${c}`)
    .join("");
  const refNode = {
    sel: `${el.tagName.toLowerCase()}${first}`,
    cls: cls.slice(0, 240),
    txt: (
      (el as HTMLElement).innerText ||
      el.getAttribute("aria-label") ||
      el.getAttribute("placeholder") ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40),
    rect: {
      x: Math.round(r.left + scrollX),
      y: Math.round(r.top + scrollY),
      w: Math.round(r.width),
      h: Math.round(r.height),
    },
  };

  const pb = parentBgOf(el);
  // Фони під елементом: зупинки градієнта-предка (hero-картка) або плаский.
  const backdrops: RGBA[] = (pb.u ? gradientBackdrops(el, pb.c) : null) ?? [
    pb.c,
  ];

  // box-shadow ring: шари без розмиття зі spread>0, не inset.
  const raw = cs.boxShadow;
  const layers: {
    inset: boolean;
    color: RGBA;
    blur: number;
    spread: number;
  }[] = [];
  if (raw && raw !== "none") {
    let depth = 0;
    let cur = "";
    const parts: string[] = [];
    for (const ch of raw) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        parts.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    for (const p of parts) {
      const colorM = p.match(
        /((?:rgba?|oklab|oklch|lab|lch|hsla?|color)\([^)]*\)|#[0-9a-f]{3,8})/i,
      );
      const rest = p.replace(colorM?.[0] ?? "", "").replace(/\binset\b/, "");
      const nums = (rest.match(/-?\d*\.?\d+(?=px)/g) ?? []).map(parseFloat);
      layers.push({
        inset: /\binset\b/.test(p),
        color: colorM ? parse(colorM[0]) : { r: 0, g: 0, b: 0, a: 0 },
        blur: nums[2] ?? 0,
        spread: nums[3] ?? 0,
      });
    }
  }
  const rings = layers.filter(
    (l) => !l.inset && l.blur === 0 && l.spread > 0 && l.color.a > 0,
  );
  const insetRings = layers.filter(
    (l) => l.inset && l.blur === 0 && l.spread > 0 && l.color.a > 0,
  );
  const outlineW = parseFloat(cs.outlineWidth) || 0;
  const hasOutline = cs.outlineStyle !== "none" && outlineW > 0;
  // Контрольна точка: тривалість переходу може лишити кільце напівзгаслим.
  let mechanism = "none";
  let ringPx = 0;
  let ringColor: RGBA | null = null;
  let ratioV: number | null = null;
  if (rings.length > 0) {
    mechanism = "ring";
    // Найзовнішній шар = колір кільця (внутрішній — offset-прошарок).
    const sorted = [...rings].sort((a, b) => b.spread - a.spread);
    const outer = sorted[0]!;
    const inner = sorted[1];
    ringPx = outer.spread - (inner ? inner.spread : 0);
    ringColor = over(outer.color, pb.c);
    // Ефективне кільце проти фону, на якому воно малюється (градієнт —
    // найгірша зупинка, а не плаский стіл).
    ratioV = worstOver(ringColor, backdrops);
    if (!inner) {
      // Кільце впритул до контролу: ще й проти власної заливки (яка лежить
      // на тому самому фоні; без власної заливки сусід — сам фон, уже
      // враховано вище).
      const own = parse(cs.backgroundColor);
      if (own.a > 0)
        ratioV = Math.min(ratioV, worstOver(ringColor, backdrops, own));
    }
  } else if (insetRings.length > 0) {
    // Внутрішнє кільце (`ring-inset`): малюється ПОВЕРХ власної заливки.
    mechanism = "ring-inset";
    const outer = [...insetRings].sort((a, b) => b.spread - a.spread)[0]!;
    ringPx = outer.spread;
    const fill = ownFill(el, pb.c);
    ringColor = over(outer.color, fill);
    // Градієнт-предок: кільце й заливка складаються на кожну зупинку.
    const own = parse(cs.backgroundColor);
    ratioV = Math.min(
      ...backdrops.map((b) => {
        const f = own.a > 0 ? over(own, b) : b;
        return ratio(over(outer.color, f), f);
      }),
    );
  } else if (hasOutline) {
    mechanism = cs.outlineStyle === "auto" ? "ua-auto" : "outline";
    ringPx = outlineW;
    const oc = parse(cs.outlineColor);
    ringColor = over(oc, pb.c);
    ratioV = worstOver(ringColor, backdrops);
  }
  return {
    kind: "focus",
    ...refNode,
    mechanism,
    raw: `${cs.boxShadow.slice(0, 200)} | outline: ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
    ringPx: Math.round(ringPx * 100) / 100,
    ratio: ratioV === null ? null : Math.round(ratioV * 100) / 100,
    required: 3,
    ringColor: ringColor ? hex(ringColor) : null,
    parentBg: hex(pb.c),
    uncertain: pb.u,
  };
}
