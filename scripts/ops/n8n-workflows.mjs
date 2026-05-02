import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const workflowsDir = path.join(root, "ops", "n8n-workflows");

function arg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const found = process.argv.find((part) => part.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function baseUrl() {
  const url = process.env.N8N_API_URL || arg("url");
  if (!url)
    throw new Error("Set N8N_API_URL or pass --url=https://n8n.example");
  return url.replace(/\/$/, "");
}

function apiKey() {
  const key = process.env.N8N_API_KEY || arg("api-key");
  if (!key) throw new Error("Set N8N_API_KEY or pass --api-key=…");
  return key;
}

async function requestN8n(method, pathname, body) {
  const response = await fetch(`${baseUrl()}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": apiKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${pathname} failed: ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

async function workflowFiles() {
  const files = await fs.readdir(workflowsDir);
  return files.filter((name) => /^\d{2}-.+\.json$/.test(name)).sort();
}

async function importWorkflows() {
  const dryRun = hasFlag("dry-run");
  const files = await workflowFiles();
  const existing = dryRun
    ? { data: [] }
    : await requestN8n("GET", "/api/v1/workflows");
  const byName = new Map(
    (existing.data ?? existing ?? []).map((wf) => [wf.name, wf]),
  );

  for (const file of files) {
    const workflow = JSON.parse(
      await fs.readFile(path.join(workflowsDir, file), "utf8"),
    );
    const current = byName.get(workflow.name);
    const action = current ? "update" : "create";
    console.log(
      `${dryRun ? "would " : ""}${action}: ${file} -> ${workflow.name}`,
    );
    if (dryRun) continue;
    if (current)
      await requestN8n("PUT", `/api/v1/workflows/${current.id}`, workflow);
    else await requestN8n("POST", "/api/v1/workflows", workflow);
  }
}

async function exportWorkflows() {
  const outDir = arg("out-dir", workflowsDir);
  const dryRun = hasFlag("dry-run");
  const workflows = await requestN8n("GET", "/api/v1/workflows");
  for (const workflow of workflows.data ?? workflows ?? []) {
    const safe = `${String(workflow.name).replace(/[^a-zA-Z0-9._-]+/g, "-")}.json`;
    const target = path.join(outDir, safe);
    console.log(
      `${dryRun ? "would export" : "export"}: ${workflow.name} -> ${target}`,
    );
    if (!dryRun) {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(target, `${JSON.stringify(workflow, null, 2)}\n`);
    }
  }
}

const command = process.argv[2];
if (command === "import") await importWorkflows();
else if (command === "export") await exportWorkflows();
else {
  console.error(
    "Usage: node scripts/ops/n8n-workflows.mjs <import|export> [--dry-run]",
  );
  process.exit(1);
}
