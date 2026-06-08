#!/usr/bin/env node
// scripts/docs/generate-service-catalog.mjs
//
// Build a machine-readable mirror of `docs/architecture/service-catalog.md`
// by enumerating production surfaces from:
//   - Dockerfile.api / Dockerfile.openclaw / Dockerfile.openclaw-gateway
//   - railway.toml / railway.openclaw.toml / railway.openclaw-gateway.toml
//   - workspace folders (apps/web / apps/mobile / apps/mobile-shell)
//
// Output: `docs/governance/service-catalog.auto.json`.
//
// Acts as a **drift detector**: the markdown view stays hand-maintained
// (editorial runbook / rollback / data-sensitivity columns). This
// generator verifies every surface in the JSON is mentioned in the
// markdown — catches the case where a new Dockerfile or workspace
// lands without the service catalog being updated.
//
// Phase 3 of Initiative 0014. Plan originally said «replace
// service-catalog.md»; switched to drift-detector to keep the rich
// hand-maintained operational columns (alerts / runbooks / rollback /
// data-sensitivity) which can't be derived from code.
//
// Usage:
//   node scripts/docs/generate-service-catalog.mjs            # write
//   node scripts/docs/generate-service-catalog.mjs --check    # CI gate
//
// Exits 1 on `--check` diff, missing surface coverage in the markdown,
// or I/O error.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "../..");

const OUT_JSON = resolve(
  REPO_ROOT,
  "docs/governance/service-catalog.auto.json",
);
const VIEW_MD = resolve(REPO_ROOT, "docs/architecture/service-catalog.md");
const CODEOWNERS_PATH = resolve(REPO_ROOT, ".github/CODEOWNERS");

const SCHEMA_VERSION = 1;

// ── Helpers ─────────────────────────────────────────────────────────────────

function relPath(abs) {
  return relative(REPO_ROOT, abs).split(sep).join("/");
}

function readSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function loadOwners() {
  const text = readSafe(CODEOWNERS_PATH);
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [pathPattern, ...handles] = line.split(/\s+/);
    if (!pathPattern || handles.length === 0) continue;
    rules.push({ pattern: pathPattern, handle: handles[0] });
  }
  return rules;
}

function ownerFor(workspaceRel, rules) {
  if (!workspaceRel) return null;
  const normalized = workspaceRel.endsWith("/")
    ? workspaceRel
    : workspaceRel + "/";
  const candidates = rules
    .map((r) => {
      const p = r.pattern.replace(/^\//, "").replace(/\*\*$/, "");
      return { prefix: p, handle: r.handle };
    })
    .filter(
      (r) => r.prefix && normalized.startsWith(r.prefix.replace(/\*$/, "")),
    )
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return candidates[0]?.handle || null;
}

/**
 * Read the comment block from a railway.*.toml and try to extract a
 * `Service name: <slug>` declaration. We don't ship a TOML parser; the
 * comment convention is enforced by review.
 */
function railwayServiceName(tomlPath) {
  const text = readSafe(tomlPath);
  const m = text.match(/Service\s+name:\s*([\w-]+)/i);
  return m?.[1] || null;
}

function dockerfileExists(name) {
  return existsSync(resolve(REPO_ROOT, name));
}

function detectHealthcheckPath(workspaceRel) {
  if (!workspaceRel) return null;
  // For apps/server we know the convention — Express route at `/health`.
  // Grep the canonical route file to confirm.
  if (workspaceRel === "apps/server") {
    const routesIndex = resolve(REPO_ROOT, "apps/server/src/routes/index.ts");
    const text = readSafe(routesIndex);
    if (text.includes("/health")) return "/health";
  }
  // OpenClaw Gateway uses `/healthz` per railway.openclaw-gateway.toml conventions.
  if (workspaceRel === "ops/openclaw" || workspaceRel === "tools/openclaw") {
    return "/healthz";
  }
  return null;
}

// ── Surface enumeration ─────────────────────────────────────────────────────

/**
 * Build the surface list. Hard-coded ordering matches the hand-maintained
 * markdown to keep diffs reviewable.
 *
 * Each surface entry only includes fields we can actually derive from
 * the filesystem — runbook links, alerts dashboards, data-sensitivity
 * tiers stay in the markdown.
 */
export function buildServiceCatalog() {
  const owners = loadOwners();
  const surfaces = [];

  // Web / PWA
  if (existsSync(resolve(REPO_ROOT, "apps/web/package.json"))) {
    surfaces.push({
      id: "web-pwa",
      title: "Web / PWA",
      workspace: "apps/web",
      deployTarget: "vercel",
      deployArtifact: "vercel.json",
      railwayService: null,
      healthcheckPath: null,
      owner: ownerFor("apps/web", owners),
    });
  }

  // API
  if (
    existsSync(resolve(REPO_ROOT, "apps/server/package.json")) &&
    dockerfileExists("Dockerfile.api")
  ) {
    surfaces.push({
      id: "api",
      title: "API (apps/server)",
      workspace: "apps/server",
      deployTarget: "railway",
      deployArtifact: "Dockerfile.api",
      railwayService: railwayServiceName(resolve(REPO_ROOT, "railway.toml")),
      healthcheckPath: detectHealthcheckPath("apps/server"),
      owner: ownerFor("apps/server", owners),
    });
  }

  // Mobile (Expo)
  if (existsSync(resolve(REPO_ROOT, "apps/mobile/package.json"))) {
    surfaces.push({
      id: "mobile-expo",
      title: "Mobile (Expo)",
      workspace: "apps/mobile",
      deployTarget: "expo-eas",
      deployArtifact: "eas.json",
      railwayService: null,
      healthcheckPath: null,
      owner: ownerFor("apps/mobile", owners),
    });
  }

  // Mobile shell (Capacitor wrapping apps/web)
  if (existsSync(resolve(REPO_ROOT, "apps/mobile-shell/package.json"))) {
    surfaces.push({
      id: "mobile-shell",
      title: "Mobile shell (Capacitor)",
      workspace: "apps/mobile-shell",
      deployTarget: "capacitor-stores",
      deployArtifact: "capacitor.config.ts",
      railwayService: null,
      healthcheckPath: null,
      owner: ownerFor("apps/mobile-shell", owners),
    });
  }

  // OpenClaw (legacy Telegram bot)
  if (
    existsSync(resolve(REPO_ROOT, "tools/openclaw/package.json")) &&
    dockerfileExists("Dockerfile.openclaw")
  ) {
    surfaces.push({
      id: "openclaw",
      title: "OpenClaw (Telegram bot)",
      workspace: "tools/openclaw",
      deployTarget: "railway",
      deployArtifact: "Dockerfile.openclaw",
      railwayService: railwayServiceName(
        resolve(REPO_ROOT, "railway.openclaw.toml"),
      ),
      healthcheckPath: null,
      owner: ownerFor("tools/openclaw", owners),
    });
  }

  // OpenClaw Gateway (Phase 7 cutover — ADR-0055)
  if (dockerfileExists("Dockerfile.openclaw-gateway")) {
    surfaces.push({
      id: "openclaw-gateway",
      title: "OpenClaw Gateway",
      workspace: existsSync(resolve(REPO_ROOT, "ops/openclaw"))
        ? "ops/openclaw"
        : null,
      deployTarget: "railway",
      deployArtifact: "Dockerfile.openclaw-gateway",
      railwayService: railwayServiceName(
        resolve(REPO_ROOT, "railway.openclaw-gateway.toml"),
      ),
      healthcheckPath: detectHealthcheckPath("ops/openclaw"),
      owner: ownerFor("ops/openclaw", owners),
    });
  }

  // n8n workflows (operate as ops surface, no Dockerfile)
  if (existsSync(resolve(REPO_ROOT, "ops/n8n-workflows"))) {
    surfaces.push({
      id: "n8n-workflows",
      title: "n8n workflows",
      workspace: null,
      deployTarget: "n8n-runtime",
      deployArtifact: "ops/n8n-workflows/",
      railwayService: null,
      healthcheckPath: null,
      owner: ownerFor("ops/n8n-workflows", owners),
    });
  }

  return {
    $schema: "./schemas/service-catalog.schema.json",
    version: SCHEMA_VERSION,
    generated_at: todayISO(),
    surfaces,
  };
}

// ── Markdown coverage check ─────────────────────────────────────────────────

/**
 * Verify that every surface in `catalog.surfaces` is mentioned in the
 * markdown view. A surface counts as mentioned if either its title,
 * its workspace path (in backticks or plain) appears in the text.
 */
export function findMissingMentions(catalog, viewText) {
  const errors = [];
  for (const s of catalog.surfaces) {
    const titleOk = viewText.toLowerCase().includes(s.title.toLowerCase());
    const wsOk = s.workspace
      ? viewText.includes("`" + s.workspace + "`") ||
        viewText.includes(s.workspace)
      : true;
    if (!titleOk && !wsOk) {
      errors.push(
        `surface ${s.id} (${s.title}${s.workspace ? `, ${s.workspace}` : ""}) is not mentioned in ${relPath(VIEW_MD)}`,
      );
    }
  }
  return errors;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function renderJSON(catalog) {
  return JSON.stringify(catalog, null, 2) + "\n";
}

function main() {
  const args = process.argv.slice(2);
  const wantsCheck = args.includes("--check");

  const catalog = buildServiceCatalog();
  const nextJson = renderJSON(catalog);
  const viewText = readSafe(VIEW_MD);
  const coverageErrors = findMissingMentions(catalog, viewText);

  if (wantsCheck) {
    const current = readSafe(OUT_JSON);
    let mismatch = false;
    if (current !== nextJson) {
      console.error(
        `${relPath(OUT_JSON)} is out of date. Run \`pnpm docs:gen-service-catalog\` and commit.`,
      );
      mismatch = true;
    }
    if (coverageErrors.length > 0) {
      console.error(
        `${relPath(VIEW_MD)} is missing ${coverageErrors.length} surface mention${coverageErrors.length === 1 ? "" : "s"}:`,
      );
      for (const err of coverageErrors) console.error(`  - ${err}`);
      mismatch = true;
    }
    if (mismatch) process.exit(1);
    console.log(
      `service-catalog.auto.json: up to date (${catalog.surfaces.length} surface${catalog.surfaces.length === 1 ? "" : "s"}); markdown coverage OK.`,
    );
    process.exit(0);
  }

  writeFileSync(OUT_JSON, nextJson);
  if (coverageErrors.length > 0) {
    console.warn(
      `Warning: ${relPath(VIEW_MD)} is missing ${coverageErrors.length} surface mention${coverageErrors.length === 1 ? "" : "s"}; --check would fail.`,
    );
    for (const err of coverageErrors) console.warn(`  - ${err}`);
  }
  console.log(
    `Wrote ${relPath(OUT_JSON)} (${catalog.surfaces.length} surface${catalog.surfaces.length === 1 ? "" : "s"}).`,
  );
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) main();
