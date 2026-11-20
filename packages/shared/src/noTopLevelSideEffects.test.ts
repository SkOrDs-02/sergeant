/**
 * Сторож: модулі `packages/shared/src` не мають побічних ефектів верхнього
 * рівня.
 *
 * AI-CONTEXT: веб-білд оголошує весь пакет вільним від побічних ефектів
 * (`treeshake.moduleSideEffects` у `apps/web/vite.config.js`, коміт
 * `e6a25ab`, eager 270,3 → 254,6 kB). Rollup після цього викидає модуль,
 * з якого не взято жодного імені, РАЗОМ з його кодом верхнього рівня. Тож
 * модуль, який імпортують заради ефекту (реєстрація, поліфіл, патч
 * глобалу, запис у сховище на імпорті), у вебі мовчки зникає, і нічого не
 * падає. Цей тест робить таке місце червоним.
 *
 * Що вважається ефектом (лише код, що виконується на імпорті; тіла функцій,
 * методів і стрілок не аналізуються, бо вони відкладені):
 *   - `import "x"` без імен;
 *   - будь-який оператор верхнього рівня, крім оголошень (вираз-оператор,
 *     `if`, `for`, `try`, блок тощо);
 *   - в ініціалізаторах `const`/`let`, `export default` і статичних полях
 *     класу: присвоєння, `delete`, виклик методу глобалу
 *     (`window.addEventListener`, `localStorage.setItem`), передача глобалу
 *     аргументом (`Object.assign(globalThis, …)`), таймери;
 *   - `static {}` блоки класів і неоголошувані (`declare` без) namespace-и.
 *
 * Звичайні `export const x = f()` з чистими фабриками (zod-схеми,
 * `Object.freeze`, `new Map`) дозволені: виклик сам по собі не ефект,
 * інакше сторож тонув би у винятках. Ціна: виклик, що пише в глобал
 * опосередковано (через функцію з іншого модуля), статичний розбір не
 * бачить. Такі функції пиши явними й клич зі споживача, а не на імпорті.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Дозволені винятки: шлях відносно `packages/shared/src` → чому ефект
 * безпечний. Кожен новий рядок тут означає, що веб може втратити цей
 * код; додавай лише з поясненням, чому це не так.
 */
const ALLOWED: Readonly<Record<string, string>> = {};

const GLOBAL_OBJECTS = new Set([
  "globalThis",
  "window",
  "self",
  "global",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "process",
  "console",
]);

const SCHEDULERS = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "addEventListener",
  "removeEventListener",
  "dispatchEvent",
  "postMessage",
  "fetch",
  "importScripts",
]);

interface SideEffectFinding {
  line: number;
  reason: string;
  text: string;
}

function rootIdentifier(node: ts.Expression): string | null {
  let current: ts.Expression = node;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    return null;
  }
}

function isDeferred(node: ts.Node): boolean {
  return (
    ts.isFunctionLike(node) ||
    // Тіла класів-виразів: методи відкладені, статику ловимо окремо.
    ts.isClassExpression(node)
  );
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment &&
    kind <= ts.SyntaxKind.LastAssignment
  );
}

/** Ефекти в ініціалізаторі, що виконується на імпорті. */
function scanEagerExpression(
  root: ts.Node,
  report: (node: ts.Node, reason: string) => void,
): void {
  const visit = (node: ts.Node): void => {
    if (isDeferred(node)) {
      if (ts.isClassExpression(node)) scanClassStatics(node, report);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperator(node.operatorToken.kind)
    ) {
      report(node, "присвоєння на імпорті");
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      report(node, "інкремент на імпорті");
    } else if (ts.isDeleteExpression(node)) {
      report(node, "delete на імпорті");
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      const calleeRoot = rootIdentifier(callee);
      if (calleeName && SCHEDULERS.has(calleeName)) {
        report(node, `виклик ${calleeName} на імпорті`);
      } else if (
        calleeRoot &&
        GLOBAL_OBJECTS.has(calleeRoot) &&
        !ts.isIdentifier(callee)
      ) {
        report(node, `виклик методу глобалу ${calleeRoot} на імпорті`);
      } else {
        for (const arg of node.arguments) {
          if (ts.isIdentifier(arg) && GLOBAL_OBJECTS.has(arg.text)) {
            report(node, `глобал ${arg.text} переданий у виклик на імпорті`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

function scanClassStatics(
  node: ts.ClassLikeDeclaration,
  report: (node: ts.Node, reason: string) => void,
): void {
  for (const member of node.members) {
    if (ts.isClassStaticBlockDeclaration(member)) {
      report(member, "static-блок класу виконується на імпорті");
    } else if (
      ts.isPropertyDeclaration(member) &&
      member.initializer &&
      ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static
    ) {
      scanEagerExpression(member.initializer, report);
    }
  }
}

function hasDeclareModifier(node: ts.Declaration): boolean {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Ambient) !== 0;
}

/** Розбір одного файла: повертає оператори з побічним ефектом на імпорті. */
function findTopLevelSideEffects(
  source: string,
  fileName = "module.ts",
): SideEffectFinding[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: SideEffectFinding[] = [];
  const report = (node: ts.Node, reason: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
    findings.push({
      line: line + 1,
      reason,
      text: node.getText(file).split("\n")[0]!.slice(0, 120),
    });
  };

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.importClause) {
        report(statement, "import без імен (заради ефекту)");
      }
      continue;
    }
    if (
      ts.isExportDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isFunctionDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement) ||
      ts.isEmptyStatement(statement)
    ) {
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      scanClassStatics(statement, report);
      continue;
    }
    if (ts.isModuleDeclaration(statement)) {
      if (!hasDeclareModifier(statement)) {
        report(statement, "namespace з кодом виконується на імпорті");
      }
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (decl.initializer) scanEagerExpression(decl.initializer, report);
      }
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      scanEagerExpression(statement.expression, report);
      continue;
    }
    if (
      ts.isExpressionStatement(statement) &&
      (ts.isStringLiteral(statement.expression) ||
        // `void x;` гасить «unused» для компіляційних звірок типів
        // (`schemas/api.ts`, `_paywallSurfaceParity`): читання імені, не ефект.
        (ts.isVoidExpression(statement.expression) &&
          ts.isIdentifier(statement.expression.expression)))
    ) {
      continue; // директива "use strict" або `void ідентифікатор`
    }
    report(statement, "оператор верхнього рівня виконується на імпорті");
  }
  return findings;
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "__fixtures__") continue;
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|js|mjs)$/.test(name)) continue;
    if (/\.d\.ts$/.test(name)) continue;
    if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(name)) continue;
    out.push(full);
  }
  return out;
}

describe("findTopLevelSideEffects: що ловить", () => {
  const VIOLATIONS: Array<[string, string]> = [
    ["import без імен", `import "./polyfill";`],
    ["голий виклик", `register("x", handler);`],
    ["присвоєння глобалу", `globalThis.__sergeant = {};`],
    [
      "window у ініціалізаторі",
      `export const off = window.addEventListener("x", f);`,
    ],
    ["запис у сховище", `const saved = localStorage.setItem("k", "v");`],
    [
      "Object.assign(globalThis)",
      `export const p = Object.assign(globalThis, { a: 1 });`,
    ],
    ["таймер", `const t = setInterval(tick, 1000);`],
    ["if на верхньому рівні", `if (typeof window !== "undefined") boot();`],
    ["try на верхньому рівні", `try { init(); } catch {}`],
    ["присвоєння в ініціалізаторі", `export const x = (cache.ready = true);`],
    ["static-блок", `export class A { static { register(A); } }`],
    ["namespace з кодом", `namespace N { export const a = 1; }`],
    [
      "export default з ефектом",
      `export default document.createElement("div");`,
    ],
    ["void виклику", `void boot();`],
  ];

  it.each(VIOLATIONS)("RED: %s", (_label, source) => {
    expect(findTopLevelSideEffects(source)).not.toEqual([]);
  });

  const CLEAN: Array<[string, string]> = [
    [
      "zod-схема",
      `import { z } from "zod"; export const S = z.object({ a: z.string() });`,
    ],
    ["Object.freeze", `export const K = Object.freeze({ a: 1 });`],
    ["new Map", `const m = new Map<string, number>([["a", 1]]);`],
    ["чиста фабрика", `export const keys = makeKeys("finyk");`],
    [
      "функція з ефектом усередині",
      `export function boot() { window.addEventListener("x", f); g = 1; }`,
    ],
    [
      "стрілка з ефектом усередині",
      `export const boot = () => { globalThis.a = 1; };`,
    ],
    [
      "типи і реекспорт",
      `export type A = string; export interface B { a: 1 } export * from "./x"; export { y } from "./y";`,
    ],
    ["enum", `export enum E { A, B }`],
    [
      "клас з методами",
      `export class C { static k = new Set(); m() { this.a = 1; } }`,
    ],
    ["declare global", `declare global { interface Window { a: 1 } }`],
    [
      "тільки typeof глобалу",
      `export const hasWindow = typeof window !== "undefined";`,
    ],
    [
      "void ідентифікатора (звірка типів)",
      `const _parity: true = true; void _parity;`,
    ],
  ];

  it.each(CLEAN)("GREEN: %s", (_label, source) => {
    expect(findTopLevelSideEffects(source)).toEqual([]);
  });
});

describe("packages/shared/src без побічних ефектів верхнього рівня", () => {
  it("кожен модуль пакета можна викинути з бандла без втрати поведінки", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split(sep).join("/");
      if (rel in ALLOWED) continue;
      for (const f of findTopLevelSideEffects(
        readFileSync(file, "utf8"),
        file,
      )) {
        offenders.push(`${rel}:${f.line} ${f.reason}: ${f.text}`);
      }
    }
    expect(
      offenders,
      "Модуль @sergeant/shared має код, що виконується на імпорті. Веб-білд " +
        "оголошує пакет вільним від побічних ефектів (apps/web/vite.config.js, " +
        "treeshake.moduleSideEffects), тож такий код у вебі мовчки зникне. " +
        "Перенеси ефект у явну функцію, яку кличе споживач, або додай виняток " +
        "в ALLOWED з поясненням.",
    ).toEqual([]);
  });

  it("винятки в ALLOWED ще існують і досі потрібні", () => {
    for (const rel of Object.keys(ALLOWED)) {
      const findings = findTopLevelSideEffects(
        readFileSync(join(SRC_ROOT, rel), "utf8"),
        rel,
      );
      expect(findings, `${rel}: виняток більше не потрібен`).not.toEqual([]);
    }
  });
});
