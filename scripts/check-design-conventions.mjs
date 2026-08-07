#!/usr/bin/env node
// scripts/check-design-conventions.mjs
//
// Механічний гейт для дизайн-конвенцій після ADR-0081 (закриває audit
// finding E1 — enforcement vacuum: естетичні ESLint-правила retired, а
// review сам по собі не ловить регресії). Це НЕ повернення AST-лінтів —
// лише дешевий zero-dep grep-рівень для чотирьох конвенцій, які добре
// ловляться текстово:
//
//   1. raw palette hex у className (Tailwind arbitrary value `bg-[#fff]`
//      або голий hex у className-рядку) — кольори лише через токени;
//   2. `focus:` Tailwind-варіант — стилізація фокуса лише через
//      `focus-visible:` / `focus-within:`. Виняток: `focus:outline-none`
//      — канонічний парний патерн з `focus-visible:ring` (див.
//      apps/web/src/shared/components/ui/Button.tsx);
//   3. `text-2xs` (10px) поза allowlist — 12px floor, текст через
//      `.text-style-*`;
//   4. довільні під-12px розміри `text-[NNpx]` (NN < 12) поза allowlist.
//
// Anti-false-positive підхід: сканується лише ВМІСТ рядкових літералів
// ('…', "…", `…`) після зрізання коментарів. Це автоматично пропускає
// JSX-текст (Do/Don't демо в DesignShowcase на кшталт <code>focus:ring-2</code>),
// TS-типи (`focus: Rec | null`), докстрінги й коментарі. Ціна — окремі
// misses (наприклад, hex у style={{}}), і це свідомо: false positives
// мають бути біля нуля.
//
// AST-рівневі конвенції (opacity scale, `-strong` companions,
// module-accent containment) цим скриптом СВІДОМО не покриті —
// вони лишаються tokens + review (див. docs/05-design/design/README.md).
//
// Usage:
//   pnpm lint:design-conventions
//   node scripts/check-design-conventions.mjs [--root=/path/to/repo]
//
// Exit 1 при порушеннях, 0 інакше.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, "..");

// Сканується КОЖНА web-поверхня з Tailwind-семантикою. `apps/landing/src` і
// `apps/mobile-shell/src` додані 2026-08-07: обидві на нулі порушень, тож це
// чистий guardrail без burndown-у — гейт тепер ловить регресію там, де раніше
// її не бачив ніхто.
//
// `apps/mobile/src` СВІДОМО поза скоупом: NativeWind-поверхня має 156
// порушень 12px-floor (17 `text-2xs` + 139 `text-[<12px]`) і — головне —
// НУЛЬ `.text-style-*`, тобто мігрувати немає куди. Спершу потрібна
// семантична шкала для mobile (owner-decision, `frontend.md` п.8), і лише
// потім burndown + розширення цього списку. Правило `focusVariant` для
// mobile у будь-якому разі не має сенсу (немає клавіатурного фокуса).
const SCAN_DIRS = ["apps/web/src", "apps/landing/src", "apps/mobile-shell/src"];
const SOURCE_EXT_RE = /\.(?:ts|tsx)$/;
const SKIP_FILE_RE = /(?:\.test\.|\.stories\.|\.d\.ts$)/;

// ── ALLOWLIST ────────────────────────────────────────────────────────────────
// Repo-relative шляхи. Запис, що закінчується на "/", — префікс директорії.
// Кожен запис МУСИТЬ мати коментар ЧОМУ він дозволений. Записи з
// `TODO(design-lint)` — борг на замітання, не постійні винятки.
const ALLOWLIST = {
  rawHexInClassName: [],
  focusVariant: [
    // Канонічний skip-link патерн: елемент sr-only і отримує фокус лише
    // з клавіатури (Tab), тож `focus:` тут семантично еквівалентний
    // `focus-visible:`, а reveal через `focus:not-sr-only` — стандарт a11y.
    "apps/web/src/shared/components/ui/SkipLink.tsx",
  ],
  text2xs: [
    // Визнаний chart-axis-tick виняток — AI-CONTEXT у самому файлі
    // (мітки осей heatmap, aria-hidden, не читабельний текст).
    "apps/web/src/modules/routine/components/HabitHeatmap.tsx",
    // Еталонна typography-сторінка showcase: `text-2xs` фігурує лише як
    // текст BAD-прикладу в <code> і в коментарі — навмисні експонати.
    "apps/web/src/core/DesignShowcase/sections/Typography.tsx",
  ],
  sub12pxArbitrary: [],
};

// ── Правила ──────────────────────────────────────────────────────────────────
// Кожне правило матчить ВМІСТ рядкового літерала (див. tokenizer нижче).

// 1a. Tailwind arbitrary value з hex: `bg-[#fff]`, `text-[#1c1917]/80`,
//     `[color:#fff]`. Ловить hex і в className="...", і в cn()/clsx()/cva().
const HEX_ARBITRARY_RE = /\[[^\][\s]*#[0-9a-fA-F]{3,8}[^\][]*\]/g;
// 1b. Голий hex у літералі, який стоїть одразу за className= / cn( / clsx(.
const BARE_HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const CLASSNAME_CONTEXT_RE = /(?:className\s*=\s*\{?\s*|\b(?:cn|clsx)\()$/;

// 2. `focus:` варіант (включно з group-/peer-focus:), крім focus:outline-none.
//    `focus-visible:` і `focus-within:` НЕ містять підрядка "focus:", тож
//    additional negative lookahead не потрібен.
const FOCUS_RE = /\bfocus:(?!outline-none\b)[a-zA-Z[\d!-][\w\][/.%!-]*/g;

// 3. text-2xs (10px токен).
const TEXT_2XS_RE = /\btext-2xs\b/g;

// 4. Довільний під-12px розмір: text-[NNpx], NN < 12.
const SUB_12PX_RE = /\btext-\[(\d+(?:\.\d+)?)px\]/g;

const RULES = [
  {
    id: "rawHexInClassName",
    label: "raw palette hex у className (кольори лише через токени)",
    match(literal) {
      const hits = [...literal.content.matchAll(HEX_ARBITRARY_RE)];
      if (literal.inClassNameContext) {
        for (const m of literal.content.matchAll(BARE_HEX_RE)) {
          // Не дублюємо hex, який уже впіймав arbitrary-патерн.
          if (
            !hits.some(
              (h) => m.index >= h.index && m.index < h.index + h[0].length,
            )
          ) {
            hits.push(m);
          }
        }
      }
      return hits;
    },
  },
  {
    id: "focusVariant",
    label:
      "`focus:` варіант — використовуй `focus-visible:` (або `focus-within:`)",
    match(literal) {
      return [...literal.content.matchAll(FOCUS_RE)];
    },
  },
  {
    id: "text2xs",
    label:
      "`text-2xs` поза allowlist — 12px floor, використовуй `.text-style-*`",
    match(literal) {
      return [...literal.content.matchAll(TEXT_2XS_RE)];
    },
  },
  {
    id: "sub12pxArbitrary",
    label: "довільний під-12px розмір `text-[NNpx]` — 12px floor",
    match(literal) {
      return [...literal.content.matchAll(SUB_12PX_RE)].filter(
        (m) => Number.parseFloat(m[1]) < 12,
      );
    },
  },
];

// ── Tokenizer: рядкові літерали без коментарів ───────────────────────────────

/**
 * Витягує рядкові літерали ('…', "…", `…`) з TS/TSX-джерела, зрізаючи
 * `//` та `/* … *\/` коментарі. Повертає масив
 * `{ content, line, inClassNameContext }`, де `line` — 1-based рядок
 * початку літерала, а `inClassNameContext` — чи стоїть літерал одразу
 * після `className=` / `cn(` / `clsx(` (для правила про голий hex).
 *
 * Свідомо простий: не парсить regex-літерали і вкладені template-и в
 * `${}` — для grep-гейта цього досить.
 */
export function extractStringLiterals(source) {
  const literals = [];
  const n = source.length;
  let i = 0;
  let line = 1;

  const pushLiteral = (content, startLine, startIndex) => {
    const before = source.slice(Math.max(0, startIndex - 24), startIndex);
    literals.push({
      content,
      line: startLine,
      inClassNameContext: CLASSNAME_CONTEXT_RE.test(before),
    });
  };

  while (i < n) {
    const ch = source[i];
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }
    // Коментарі — зрізаємо, щоб докстрінги з анти-прикладами не фейлили гейт.
    if (ch === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const startLine = line;
      const startIndex = i;
      let content = "";
      i++;
      while (i < n && source[i] !== ch && source[i] !== "\n") {
        if (source[i] === "\\") {
          content += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        content += source[i];
        i++;
      }
      i++;
      pushLiteral(content, startLine, startIndex);
      continue;
    }
    if (ch === "`") {
      const startLine = line;
      const startIndex = i;
      let content = "";
      let exprDepth = 0;
      i++;
      while (i < n) {
        if (source[i] === "\\") {
          content += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (source[i] === "`" && exprDepth === 0) break;
        if (source[i] === "$" && source[i + 1] === "{") {
          exprDepth++;
          content += "${";
          i += 2;
          continue;
        }
        if (exprDepth > 0 && source[i] === "}") {
          exprDepth--;
          content += "}";
          i++;
          continue;
        }
        if (source[i] === "\n") line++;
        content += source[i];
        i++;
      }
      i++;
      pushLiteral(content, startLine, startIndex);
      continue;
    }
    i++;
  }
  return literals;
}

// ── Сканування ───────────────────────────────────────────────────────────────

function isAllowlisted(ruleId, relPath) {
  return (ALLOWLIST[ruleId] ?? []).some((entry) =>
    entry.endsWith("/") ? relPath.startsWith(entry) : relPath === entry,
  );
}

/** Рядок усередині (можливо багаторядкового template-) літерала. */
function lineOfMatch(literal, matchIndex) {
  let offset = literal.line;
  for (let i = 0; i < matchIndex; i++) {
    if (literal.content[i] === "\n") offset++;
  }
  return offset;
}

export function scanSource(source, relPath) {
  const violations = [];
  const literals = extractStringLiterals(source);
  for (const rule of RULES) {
    if (isAllowlisted(rule.id, relPath)) continue;
    for (const literal of literals) {
      for (const m of rule.match(literal)) {
        violations.push({
          rule: rule.id,
          label: rule.label,
          file: relPath,
          line: lineOfMatch(literal, m.index ?? 0),
          token: m[0].trim(),
        });
      }
    }
  }
  return violations;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "__tests__" ||
        entry.startsWith(".")
      )
        continue;
      yield* walk(full);
    } else if (
      st.isFile() &&
      SOURCE_EXT_RE.test(entry) &&
      !SKIP_FILE_RE.test(entry)
    ) {
      yield full;
    }
  }
}

export function scan(root = DEFAULT_ROOT) {
  const violations = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(resolve(root, dir))) {
      const rel = relative(root, file).split(sep).join("/");
      violations.push(...scanSource(readFileSync(file, "utf8"), rel));
    }
  }
  return violations;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = rootArg
    ? resolve(rootArg.slice("--root=".length))
    : DEFAULT_ROOT;
  const violations = scan(root);

  if (violations.length > 0) {
    console.error(
      `❌ [check-design-conventions] ${violations.length} порушення(-нь) дизайн-конвенцій:`,
    );
    for (const v of violations) {
      console.error(`  ❌ ${v.file}:${v.line}  ${v.token}  — ${v.label}`);
    }
    console.error(
      "\nВиправ через design tokens / .text-style-* / focus-visible:, або — якщо це " +
        "усвідомлений виняток — додай файл в ALLOWLIST у scripts/check-design-conventions.mjs " +
        "з коментарем ЧОМУ. Довідка: docs/05-design/design/design-system.md.",
    );
    process.exit(1);
  }

  console.log(
    `✅ [check-design-conventions] OK — raw hex / focus: / text-2xs / під-12px ` +
      `порушень не знайдено (${SCAN_DIRS.join(", ")}).`,
  );
}
