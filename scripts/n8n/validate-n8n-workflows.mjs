import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const workflowsDir = path.join(root, "ops", "n8n-workflows");
const manifestPath = path.join(workflowsDir, "manifest.json");
const VALID_STATUS = new Set(["prod-ready", "experimental", "draft"]);
const VALID_RISK = new Set(["P0", "P1", "P2", "P3"]);
const SIGNED_WEBHOOKS = new Set([
  "01-billing-pipeline.json",
  "02-failed-payment-recovery.json",
  "03-sentry-alert-routing.json",
  "05-renovate-pr-auto-handler.json",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listWorkflowFiles() {
  // Workflow files are prefixed with a numeric id and a dash:
  //   - 01..99 — original "ops" range, used by all production workflows.
  //   - 100+   — Wave-3+ control-plane workflows that wrap the foundation
  //              (e.g. 103 alert escalation, 104 alert callback router).
  // Allow 2-or-more digits so the manifest can grow past 99 without a
  // schema change.
  return fs
    .readdirSync(workflowsDir)
    .filter((name) => /^\d{2,}-.+\.json$/.test(name))
    .sort();
}

function collectEnvRefs(workflowText) {
  return [...workflowText.matchAll(/\$env\.([A-Z0-9_]+)/g)]
    .map((m) => m[1])
    .sort();
}

function collectCredentialNames(workflow) {
  const names = new Set();
  for (const node of workflow.nodes ?? []) {
    for (const credential of Object.values(node.credentials ?? {})) {
      if (credential && typeof credential.name === "string") {
        names.add(credential.name);
      }
    }
  }
  return [...names].sort();
}

function fail(errors, message) {
  errors.push(message);
}

function validateWorkflow(file, manifestEntry, errors) {
  const filePath = path.join(workflowsDir, file);
  const text = fs.readFileSync(filePath, "utf8");
  const workflow = JSON.parse(text);
  const nodeNames = new Set();

  if (workflow.active === true) {
    fail(errors, `${file}: workflows in git must be inactive by default`);
  }

  if (!Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    fail(errors, `${file}: missing nodes[]`);
    return;
  }

  for (const node of workflow.nodes) {
    if (!node.id || !node.name || !node.type) {
      fail(errors, `${file}: every node needs id, name, and type`);
    }
    if (nodeNames.has(node.name)) {
      fail(errors, `${file}: duplicate node name "${node.name}"`);
    }
    nodeNames.add(node.name);
  }

  for (const [source, byOutput] of Object.entries(workflow.connections ?? {})) {
    if (!nodeNames.has(source)) {
      fail(errors, `${file}: connection source "${source}" has no node`);
    }
    for (const outputs of Object.values(byOutput ?? {})) {
      for (const group of outputs ?? []) {
        for (const edge of group ?? []) {
          if (!nodeNames.has(edge.node)) {
            fail(
              errors,
              `${file}: connection target "${edge.node}" has no node`,
            );
          }
        }
      }
    }
  }

  if (SIGNED_WEBHOOKS.has(file)) {
    const webhookNodes = workflow.nodes.filter((node) =>
      String(node.type).includes(".webhook"),
    );
    if (webhookNodes.length === 0) {
      fail(errors, `${file}: signed workflow must contain a webhook node`);
    }
    for (const node of webhookNodes) {
      if (node.parameters?.options?.rawBody !== true) {
        fail(
          errors,
          `${file}: signed webhook "${node.name}" must enable rawBody`,
        );
      }
    }
  }

  const usedEnv = collectEnvRefs(text);
  const declaredEnv = new Set(manifestEntry.requiredEnv ?? []);
  for (const envName of usedEnv) {
    if (!declaredEnv.has(envName)) {
      fail(
        errors,
        `${file}: $env.${envName} used but not listed in manifest.requiredEnv`,
      );
    }
  }

  const usedCredentials = collectCredentialNames(workflow);
  const declaredCredentials = new Set(manifestEntry.requiredCredentials ?? []);
  for (const credential of usedCredentials) {
    if (!declaredCredentials.has(credential)) {
      fail(
        errors,
        `${file}: credential "${credential}" used but not listed in manifest.requiredCredentials`,
      );
    }
  }

  // Mono bank sends transaction notifications via webhook POST —
  // a public webhook endpoint is the intended trigger for workflow 06.
  // (Previous rule removed: production uses n8n-nodes-base.webhook.)
}

function main() {
  const errors = [];
  const manifest = readJson(manifestPath);
  const files = listWorkflowFiles();
  const entries = manifest.workflows ?? {};

  for (const file of files) {
    const entry = entries[file];
    if (!entry) {
      fail(errors, `${file}: missing manifest entry`);
      continue;
    }
    if (!entry.owner) fail(errors, `${file}: manifest.owner is required`);
    if (!VALID_STATUS.has(entry.status)) {
      fail(errors, `${file}: invalid manifest.status "${entry.status}"`);
    }
    if (!VALID_RISK.has(entry.riskTier)) {
      fail(errors, `${file}: invalid manifest.riskTier "${entry.riskTier}"`);
    }
    // PR-48 follow-up — manifest tracks outbound HMAC roll-out per
    // workflow. Field is optional (omitted = unsigned, grace mode).
    // When set, must be boolean. When true, the workflow must also list
    // `WEBHOOK_HMAC_SECRET` in `requiredEnv` so ops know it needs to be
    // wired before flipping the global `WEBHOOK_HMAC_REQUIRED=true`.
    if (Object.prototype.hasOwnProperty.call(entry, "hmacSigned")) {
      if (typeof entry.hmacSigned !== "boolean") {
        fail(errors, `${file}: manifest.hmacSigned must be boolean`);
      } else if (entry.hmacSigned === true) {
        const declared = new Set(entry.requiredEnv ?? []);
        if (!declared.has("WEBHOOK_HMAC_SECRET")) {
          fail(
            errors,
            `${file}: hmacSigned=true but WEBHOOK_HMAC_SECRET missing from requiredEnv`,
          );
        }
      }
    }
    validateWorkflow(file, entry, errors);
  }

  for (const file of Object.keys(entries)) {
    if (!files.includes(file)) {
      fail(errors, `${file}: manifest entry has no workflow file`);
    }
  }

  if (errors.length > 0) {
    console.error("n8n workflow validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Validated ${files.length} n8n workflows.`);
}

main();
