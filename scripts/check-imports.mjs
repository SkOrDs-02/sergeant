import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());

const MODULE_ROOTS = [
  path.join(repoRoot, "apps", "web", "src", "modules", "finyk"),
  path.join(repoRoot, "apps", "web", "src", "modules", "fizruk"),
  path.join(repoRoot, "apps", "web", "src", "modules", "nutrition"),
  path.join(repoRoot, "apps", "web", "src", "modules", "routine"),
];

const forbidden = [
  {
    re: /from\s+["']\.\/components\/ui\//g,
    hint: "Використовуй @shared/components/ui/* замість ./components/ui/*",
  },
  {
    re: /from\s+["']\.\.\/components\/ui\//g,
    hint: "Використовуй @shared/components/ui/* замість ../components/ui/*",
  },
  {
    re: /from\s+["']\.\/lib\/cn["']/g,
    hint: "Використовуй @shared/lib/cn замість ./lib/cn",
  },
  {
    re: /from\s+["']\.\.\/lib\/cn["']/g,
    hint: "Використовуй @shared/lib/cn замість ../lib/cn",
  },
];

const e2eImportFailures = [];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function isTextFile(p) {
  return /\.(mjs|js|jsx|ts|tsx)$/.test(p);
}

let failures = [];

for (const moduleRoot of MODULE_ROOTS) {
  for (const file of walk(moduleRoot)) {
    if (!isTextFile(file)) continue;
    const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
    const src = fs.readFileSync(file, "utf8");
    for (const rule of forbidden) {
      if (rule.re.test(src)) {
        failures.push(`- ${rel}: ${rule.hint}`);
        rule.re.lastIndex = 0;
      }
    }
  }
}

const webSrcRoot = path.join(repoRoot, "apps", "web", "src");
const e2eRoot = path.join(webSrcRoot, "e2e");
const e2eAllowed = new Set([
  path.join(webSrcRoot, "main.tsx"),
  path.join(e2eRoot, "installScenarioBridge.ts"),
  path.join(e2eRoot, "world.ts"),
]);
for (const file of walk(webSrcRoot)) {
  if (!isTextFile(file) || e2eAllowed.has(file)) continue;
  const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
  const src = fs.readFileSync(file, "utf8");
  if (/from\s+["'][^"']*\/e2e\/|import\(["'][^"']*\/e2e\//.test(src)) {
    e2eImportFailures.push(
      `- ${rel}: apps/web/src/e2e можна імпортувати лише з main.tsx`,
    );
  }
}

failures.push(...e2eImportFailures);

if (failures.length) {
  console.error(
    "❌ Forbidden imports detected in modules:\n" + failures.join("\n") + "\n",
  );
  process.exit(1);
} else {
  console.log("✅ Import check passed.");
}
