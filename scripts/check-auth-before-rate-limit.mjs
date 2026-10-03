#!/usr/bin/env node
// scripts/check-auth-before-rate-limit.mjs
//
// Гейт порядку middleware: `requireSession()` мусить стояти ПЕРЕД per-user
// лімітером на кожному захищеному маршруті `apps/server/src/routes/**`.
//
// ЧОМУ ЦЕ ОКРЕМИЙ ГЕЙТ, А НЕ КОМЕНТАР. Дефект рецидивував ТРИЧІ (знахідка
// B31, далі PR-A3 наскрізного огляду 2026-09-13). Щоразу його лікували
// правильно — і щоразу лишали без механічного захисту, тобто гарантія
// трималась на коментарях у шести файлах. Ревізія 2026-09-15 перевірила
// порядок і підтвердила, що зараз він правильний, але окремо зафіксувала:
// «парсерного тесту на порядок middleware, якого вимагала Пропозиція, немає
// досі». Цей скрипт і є та відсутня частина.
//
// ЩО САМЕ ЛАМАЄТЬСЯ ПРИ НЕПРАВИЛЬНОМУ ПОРЯДКУ. `rateLimitSubject`
// (`apps/server/src/http/rateLimit.ts`) читає `req.user.id` і фолбечиться на
// `ip:<addr>`, коли сесії ще немає. Якщо per-user лімітер стоїть ДО
// `requireSession()`, `req.user` у момент перевірки завжди unset — і бакет
// мовчки стає per-IP. Нічого не падає, тести зелені, ліміт «працює»; просто
// всі за одним NAT/офісом/CGNAT діляться одним бакетом. Саме ця тиша й
// дала три рецидиви.
//
// ЧОМУ ПРЕ-AUTH IP-ЛІМІТЕР — НЕ ПОРУШЕННЯ. Він стоїть перед сесією
// НАВМИСНО: `requireSession()` на невдачі шле 401 і не кличе `next()`, тож
// без нього анонімний флуд бив би по session-store без жодного ліміту.
// Відрізняємо його за ключем: суфікс `:ip` (або імʼя-ідентифікатор із
// `preAuthIp`) = pre-auth, усе інше = per-user.
//
// МЕЖІ. Парсер рядково-балансовий, без AST і без залежностей — той самий
// компроміс, що і в `ci-bundle-budget-gates.test.mjs` / `ci-dedupe-gate`.
// Він розуміє дві форми, які реально вживає репо: ланцюжок
// `r.use(path, mw)` і вбудований масив `r.post(path, mw…, handler)`, і
// зводить їх в один ЕФЕКТИВНИЙ ланцюжок (префіксні монтування + аргументи
// виклику). Динамічно зібрані масиви middleware він не побачить — якщо такі
// зʼявляться, гейт треба переписати на AST, а не послаблювати.
//
// Запуск:  node scripts/check-auth-before-rate-limit.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ROUTES_DIR = resolve(REPO_ROOT, "apps", "server", "src", "routes");

const HTTP_VERBS = ["use", "get", "post", "put", "patch", "delete", "all"];

// Усі три резолвери сесії з `apps/server/src/http/requireSession.ts`. Саме
// вони кладуть `req.user`, на який дивиться `rateLimitSubject`.
// `requireApiSecret` / `requireInternalIp` сюди НЕ входять: вони автентифікують
// виклик, але користувача не резолвлять, тож бакет після них лишається per-IP.
const SESSION_RE = /\brequire(?:Fresh)?Session(?:Soft)?\s*\(/;

/**
 * Маршрути, де сесії немає НАВМИСНО, тож per-IP-бакет — не дефект.
 *
 * Форма списку дзеркалить `require-toast-error-action` (`eslint.cross-surface.js`):
 * гейт не вирішує за людину, але вимагає, щоб виняток був свідомим і
 * підписаним. Ключ — `<файл>::<шлях>`.
 */
const ALLOWLIST = new Map([
  [
    "apps/server/src/routes/push.ts::/api/push/send",
    // Внутрішній роут: автентифікація — shared secret (`requireApiSecret`) +
    // `requireInternalIp`, сесії немає й бути не може. Коментар на місці
    // виклику вже називає цей випадок і прямо відрізняє його від B31/PR-A3.
    "internal secret-based auth; per-target-user ліміт живе всередині sendPush",
  ],
  [
    "apps/server/src/routes/silpo.ts::/api/silpo/callback",
    // Друга половина OAuth authorization_code round-trip: користувач
    // повертається з Сільпо ще без сесії в цьому запиті. Роут навмисно
    // зареєстрований ДО router-level `requireSession()`.
    "OAuth callback — сесії на цьому кроці ще немає за побудовою",
  ],
]);

/**
 * Гасить коментарі ПРОБІЛАМИ тієї ж довжини, зберігаючи переводи рядка й
 * рядкові літерали (у них живуть `path` і `key`).
 *
 * Чому не вирізає, а гасить: офсети мусять лишитись тотожними вихідному
 * файлу, інакше номер рядка у звіті вказує в нікуди. Перша версія цього
 * скрипта саме вирізала — і показала порушення `finyk.ts` на рядках 22 і 26,
 * тобто всередині докстрінга. Гейт, який бреше координатами, ганяє людину по
 * хибному сліду незгірш за відсутній гейт.
 */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) out += src[k] === "\n" ? "\n" : " ";
  };
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      const start = i;
      while (i < n && src[i] !== "\n") i++;
      blank(start, i);
      continue;
    }
    if (c === "/" && c2 === "*") {
      const start = i;
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(i + 2, n);
      blank(start, i);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Від `start` (індекс `(`) повертає індекс парної `)`, поважаючи рядки. */
function matchParen(src, start) {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** `const heavyRateLimit = rateLimitExpress({ key: "ai-memory:recall" … })` */
export function collectNamedLimiters(src) {
  const map = new Map();
  const re = /\b(?:const|let|var)\s+(\w+)\s*=\s*rateLimitExpress\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const open = src.indexOf("(", m.index + m[0].length - 1);
    const close = matchParen(src, open);
    if (close === -1) continue;
    const body = src.slice(open, close);
    const key = /\bkey\s*:\s*["'`]([^"'`]*)["'`]/.exec(body);
    map.set(m[1], key ? key[1] : null);
  }
  return map;
}

function isPreAuth(name, key) {
  if (name && /preauthip/i.test(name)) return true;
  if (key && /:ip\b/.test(key)) return true;
  return false;
}

/**
 * Впорядкований список маркерів у тексті аргументів одного виклику.
 * Кожен маркер — `{ pos, kind: "session" | "perUser" | "preAuth", label }`.
 */
export function markersIn(argsText, namedLimiters) {
  const marks = [];

  const sessionRe = new RegExp(SESSION_RE.source, "g");
  let m;
  while ((m = sessionRe.exec(argsText))) {
    marks.push({ pos: m.index, kind: "session", label: m[0].slice(0, -1) });
  }

  // Інлайнові `rateLimitExpress({ key: "…" })`
  const inlineRe = /\brateLimitExpress\s*\(/g;
  while ((m = inlineRe.exec(argsText))) {
    const open = argsText.indexOf("(", m.index + m[0].length - 1);
    const close = matchParen(argsText, open);
    const body = close === -1 ? "" : argsText.slice(open, close);
    const keyMatch = /\bkey\s*:\s*["'`]([^"'`]*)["'`]/.exec(body);
    const key = keyMatch ? keyMatch[1] : null;
    marks.push({
      pos: m.index,
      kind: isPreAuth(null, key) ? "preAuth" : "perUser",
      label: `rateLimitExpress(key: ${key ?? "?"})`,
    });
  }

  // Іменовані лімітери, оголошені в цьому ж файлі
  for (const [name, key] of namedLimiters) {
    const idRe = new RegExp(`\\b${name}\\b`, "g");
    while ((m = idRe.exec(argsText))) {
      // пропускаємо саме оголошення (воно вже враховане інлайновим скном)
      const after = argsText.slice(m.index + name.length).trimStart();
      if (after.startsWith("=")) continue;
      marks.push({
        pos: m.index,
        kind: isPreAuth(name, key) ? "preAuth" : "perUser",
        label: `${name} (key: ${key ?? "?"})`,
      });
    }
  }

  return marks.sort((a, b) => a.pos - b.pos);
}

/** Витягує всі реєстрації роутів у порядку появи. */
export function parseRegistrations(src, namedLimiters) {
  const regs = [];
  const callRe = new RegExp(
    `\\b(\\w+)\\.(${HTTP_VERBS.join("|")})\\s*\\(`,
    "g",
  );
  let m;
  while ((m = callRe.exec(src))) {
    const open = src.indexOf("(", m.index + m[0].length - 1);
    const close = matchParen(src, open);
    if (close === -1) continue;
    const args = src.slice(open + 1, close);
    const pathMatch = /^\s*["'`]([^"'`]*)["'`]\s*,?/.exec(args);
    if (!pathMatch) continue; // не path-based — нам нецікаво
    const rest = args.slice(pathMatch[0].length);
    regs.push({
      verb: m[2],
      path: pathMatch[1],
      markers: markersIn(rest, namedLimiters),
      line: src.slice(0, m.index).split("\n").length,
    });
    callRe.lastIndex = close;
  }
  return regs;
}

function pathCovers(mountPath, routePath) {
  if (mountPath === routePath) return true;
  return routePath.startsWith(
    mountPath.endsWith("/") ? mountPath : mountPath + "/",
  );
}

/** Ефективний ланцюжок: префіксні `r.use` раніше в файлі + аргументи виклику. */
export function effectiveChain(regs, index) {
  const target = regs[index];
  const chain = [];
  for (let i = 0; i < index; i++) {
    const r = regs[i];
    if (r.verb !== "use") continue;
    if (!pathCovers(r.path, target.path)) continue;
    for (const mk of r.markers)
      chain.push({ ...mk, from: `${r.path}:${r.line}` });
  }
  for (const mk of target.markers) {
    chain.push({ ...mk, from: `${target.path}:${target.line}` });
  }
  return chain;
}

export function checkSource(relPath, src) {
  const clean = stripComments(src);
  const named = collectNamedLimiters(clean);
  const regs = parseRegistrations(clean, named);
  const violations = [];

  for (let i = 0; i < regs.length; i++) {
    const reg = regs[i];
    if (ALLOWLIST.has(`${relPath}::${reg.path}`)) continue;
    const chain = effectiveChain(regs, i);
    const firstPerUser = chain.findIndex((c) => c.kind === "perUser");
    if (firstPerUser === -1) continue;

    const firstSession = chain.findIndex((c) => c.kind === "session");
    if (firstSession === -1) {
      violations.push({
        file: relPath,
        line: reg.line,
        path: reg.path,
        reason: `per-user лімітер «${chain[firstPerUser].label}» без жодного requireSession() на маршруті — бакет назавжди per-IP`,
      });
      continue;
    }
    if (firstSession > firstPerUser) {
      violations.push({
        file: relPath,
        line: reg.line,
        path: reg.path,
        reason: `per-user лімітер «${chain[firstPerUser].label}» стоїть ПЕРЕД «${chain[firstSession].label}» — req.user ще unset, бакет мовчки стане per-IP`,
      });
    }
  }
  return violations;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!/\.ts$/.test(entry)) continue;
    if (/\.(test|spec)\.ts$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

function main() {
  const files = walk(ROUTES_DIR);
  const all = [];
  let guarded = 0;
  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    const src = readFileSync(file, "utf8");
    if (!SESSION_RE.test(stripComments(src))) continue;
    guarded++;
    all.push(...checkSource(rel, src));
  }

  console.log(
    `🔍 Порядок middleware: перевірено ${guarded} із ${files.length} route-файлів (решта без requireSession()).`,
  );

  if (all.length === 0) {
    console.log(
      "\n✅ requireSession() усюди стоїть перед per-user лімітером.\n",
    );
    return 0;
  }

  console.log(`\n❌ Порушень порядку: ${all.length}\n`);
  for (const v of all) {
    console.log(`  ${v.file}:${v.line}  (${v.path})`);
    console.log(`      ${v.reason}\n`);
  }
  console.log(
    "Постав `requireSession()` (або `requireSessionSoft()`) ПЕРЕД per-user\n" +
      "лімітером. Pre-auth IP-лімітер лишається попереду — його ключ має\n" +
      "нести суфікс `:ip`, інакше гейт вважає його per-user.\n" +
      "Розбір: docs/governance/governance/rules/ і PR-A3 в\n" +
      "docs/work/specs/audits/2026-09-13-product-full-review.md\n",
  );
  return 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main());
}
