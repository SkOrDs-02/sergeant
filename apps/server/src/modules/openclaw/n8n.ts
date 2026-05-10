/**
 * n8n delegation surface for the OpenClaw plugin (Phase 1, PR-C1c).
 *
 * Five new operations, all proxied behind `/api/internal/openclaw/*`:
 *   1. `listN8nWorkflows()`        — GET  /api/v1/workflows
 *   2. `describeN8nWorkflow(id)`   — GET  /api/v1/workflows/{id}
 *   3. `triggerN8nWorkflow(id)`    — POST /api/v1/workflows/{id}/run   (Tier A auto / Tier C gated)
 *   4. `activateN8nWorkflow(id,a)` — POST /api/v1/workflows/{id}/(de)activate   (Tier C gated)
 *   5. `refreshBusinessSnapshot()` — fires every Tier A workflow in parallel.
 *
 * AI-CONTEXT: tier policy lives in `ops/openclaw/n8n-allowlist.json` so a
 * workflow can flip from Tier A → C with a one-line config change, without a
 * plugin release. The allowlist file is read once per process and cached;
 * callers can pass an explicit `allowlist` override for tests.
 *
 * Tier semantics (mirrors `docs/planning/openclaw-migration-plan.md` §n8n):
 *   - **A** — auto-trigger, no approval. Snapshot-flows that write to our DB.
 *   - **B** — NOT triggerable. Digest-flows that post to Telegram; agent
 *             generates inline instead. Server refuses `n8n_trigger`.
 *   - **C** — approval-gated. Flows that broadcast to users / push / write
 *             externally. Server lets the call through; approval lives on
 *             the console / plugin side (`tool_call_pre` hook).
 *   - **D** — read-only. Webhook-driven externally. Server refuses
 *             `n8n_trigger` and `n8n_activate`.
 *
 * Unknown workflow IDs are treated as Tier D (refuse trigger + activate) so a
 * compromised allowlist file fails closed.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../env/env.js";
import { logger } from "../../obs/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────
// Allowlist (ops/openclaw/n8n-allowlist.json)
// ─────────────────────────────────────────────────────────────────────────

export type N8nTier = "A" | "B" | "C" | "D";

export interface N8nAllowlistEntry {
  name: string;
  tier: N8nTier;
  category?: string;
  approvalRequired?: boolean | null;
}

export interface N8nAllowlist {
  /** workflow id → metadata. Unknown ids are refused (fail-closed). */
  workflows: Record<string, N8nAllowlistEntry>;
}

const ALLOWLIST_REL_PATH = "ops/openclaw/n8n-allowlist.json";

let allowlistCache: N8nAllowlist | null = null;

/**
 * Loads `ops/openclaw/n8n-allowlist.json` (cached per process). Walks up the
 * monorepo from this file's directory until it finds the `ops/` folder so
 * the same code works when the server runs from `apps/server/dist/...` in
 * Railway or from source in dev.
 */
export async function loadN8nAllowlist(): Promise<N8nAllowlist> {
  if (allowlistCache) return allowlistCache;
  const filePath = await findRepoFile(ALLOWLIST_REL_PATH);
  if (!filePath) {
    logger.warn({
      msg: "openclaw_n8n_allowlist_missing",
      tried: ALLOWLIST_REL_PATH,
    });
    allowlistCache = { workflows: {} };
    return allowlistCache;
  }
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- `filePath` comes from server-controlled findRepoFile() walking from import.meta.url, never user input.
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as {
    workflows?: Record<string, Partial<N8nAllowlistEntry>>;
  };
  const workflows: Record<string, N8nAllowlistEntry> = {};
  for (const [id, entry] of Object.entries(parsed.workflows ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const tier = entry.tier;
    if (tier !== "A" && tier !== "B" && tier !== "C" && tier !== "D") continue;
    workflows[id] = {
      name: typeof entry.name === "string" ? entry.name : id,
      tier,
      ...(typeof entry.category === "string"
        ? { category: entry.category }
        : {}),
      ...(typeof entry.approvalRequired === "boolean"
        ? { approvalRequired: entry.approvalRequired }
        : {}),
    };
  }
  allowlistCache = { workflows };
  return allowlistCache;
}

/** Test hook — never call from production code. */
export function __resetN8nAllowlistCacheForTests(): void {
  allowlistCache = null;
}

/** Test hook — never call from production code. */
export function __setN8nAllowlistForTests(allowlist: N8nAllowlist): void {
  allowlistCache = allowlist;
}

async function findRepoFile(relPath: string): Promise<string | null> {
  let dir = __dirname;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(dir, relPath);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try parent
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────

export class N8nAllowlistError extends Error {
  readonly workflowId: string;
  readonly tier: N8nTier | "unknown";
  readonly op: "trigger" | "activate";

  constructor(opts: {
    workflowId: string;
    tier: N8nTier | "unknown";
    op: "trigger" | "activate";
    message: string;
  }) {
    super(opts.message);
    this.name = "N8nAllowlistError";
    this.workflowId = opts.workflowId;
    this.tier = opts.tier;
    this.op = opts.op;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Shared HTTP helpers
// ─────────────────────────────────────────────────────────────────────────

interface N8nCreds {
  baseUrl: string;
  apiKey: string;
}

function readN8nCreds(): N8nCreds | null {
  const baseUrl = env.N8N_API_URL;
  const apiKey = env.N8N_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function n8nFetch(
  url: string,
  init: RequestInit & { apiKey: string },
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("X-N8N-API-KEY", init.apiKey);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const { apiKey: _apiKey, ...rest } = init;
  return fetch(url, { ...rest, headers });
}

// ─────────────────────────────────────────────────────────────────────────
// list_n8n_workflows
// ─────────────────────────────────────────────────────────────────────────

export interface ListN8nWorkflowsInput {
  /** Optional tier filter — only return workflows matching the given tier(s). */
  tiers?: N8nTier[] | undefined;
  /** Page size hint forwarded to n8n (default 100, max 250). */
  limit?: number | undefined;
}

export interface ListN8nWorkflowsRow {
  id: string;
  name: string;
  active: boolean;
  tier: N8nTier | "unknown";
  category: string | null;
  /** ISO-string from n8n. May be `null` for workflows never updated. */
  updatedAt: string | null;
}

export interface ListN8nWorkflowsOutput {
  workflows: ListN8nWorkflowsRow[];
  /** True when N8N_API_URL / N8N_API_KEY are unset — surfaced as `[]`. */
  notConfigured?: boolean;
}

export async function listN8nWorkflows(
  input: ListN8nWorkflowsInput = {},
): Promise<ListN8nWorkflowsOutput> {
  const creds = readN8nCreds();
  const allowlist = await loadN8nAllowlist();
  if (!creds) {
    logger.warn({ msg: "openclaw_list_n8n_workflows_not_configured" });
    return { workflows: [], notConfigured: true };
  }

  const limit = Math.max(1, Math.min(250, input.limit ?? 100));
  const url = `${creds.baseUrl}/api/v1/workflows?limit=${limit}`;
  const res = await n8nFetch(url, { method: "GET", apiKey: creds.apiKey });
  if (!res.ok) {
    throw new Error(
      `n8n API GET /workflows returned ${res.status}: ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    data?: Array<{
      id?: string | number;
      name?: string;
      active?: boolean;
      updatedAt?: string | null;
    }>;
  };

  const tierFilter = input.tiers ? new Set(input.tiers) : null;
  const workflows: ListN8nWorkflowsRow[] = [];
  for (const row of body.data ?? []) {
    if (row?.id == null) continue;
    const id = String(row.id);
    const meta = allowlist.workflows[id];
    const tier: N8nTier | "unknown" = meta?.tier ?? "unknown";
    if (tierFilter && (tier === "unknown" || !tierFilter.has(tier))) continue;
    workflows.push({
      id,
      name: typeof row.name === "string" ? row.name : (meta?.name ?? id),
      active: row.active === true,
      tier,
      category: meta?.category ?? null,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    });
  }
  return { workflows };
}

// ─────────────────────────────────────────────────────────────────────────
// describe_n8n_workflow
// ─────────────────────────────────────────────────────────────────────────

export interface DescribeN8nWorkflowInput {
  workflowId: string;
}

export interface DescribeN8nWorkflowOutput {
  workflowId: string;
  name: string | null;
  active: boolean | null;
  tier: N8nTier | "unknown";
  category: string | null;
  approvalRequired: boolean | null;
  nodes: Array<{ name: string; type: string; disabled: boolean }>;
  triggers: string[];
  updatedAt: string | null;
  notConfigured?: boolean;
}

export async function describeN8nWorkflow(
  input: DescribeN8nWorkflowInput,
): Promise<DescribeN8nWorkflowOutput> {
  const allowlist = await loadN8nAllowlist();
  const meta = allowlist.workflows[input.workflowId];
  const creds = readN8nCreds();
  if (!creds) {
    return {
      workflowId: input.workflowId,
      name: meta?.name ?? null,
      active: null,
      tier: meta?.tier ?? "unknown",
      category: meta?.category ?? null,
      approvalRequired: meta?.approvalRequired ?? null,
      nodes: [],
      triggers: [],
      updatedAt: null,
      notConfigured: true,
    };
  }

  const url = `${creds.baseUrl}/api/v1/workflows/${encodeURIComponent(input.workflowId)}`;
  const res = await n8nFetch(url, { method: "GET", apiKey: creds.apiKey });
  if (!res.ok) {
    throw new Error(
      `n8n API GET /workflows/${input.workflowId} returned ${res.status}: ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    id?: string | number;
    name?: string;
    active?: boolean;
    nodes?: Array<{
      name?: string;
      type?: string;
      disabled?: boolean;
    }>;
    updatedAt?: string | null;
  };

  const nodes = (body.nodes ?? [])
    .filter((n) => typeof n?.type === "string" && typeof n?.name === "string")
    .map((n) => ({
      name: String(n.name),
      type: String(n.type),
      disabled: n.disabled === true,
    }));
  const triggers = nodes
    .filter((n) => /Trigger$/i.test(n.type) || /Webhook/i.test(n.type))
    .map((n) => n.type);

  return {
    workflowId: input.workflowId,
    name: typeof body.name === "string" ? body.name : (meta?.name ?? null),
    active: body.active === true ? true : body.active === false ? false : null,
    tier: meta?.tier ?? "unknown",
    category: meta?.category ?? null,
    approvalRequired: meta?.approvalRequired ?? null,
    nodes,
    triggers,
    updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// trigger_n8n_workflow
// ─────────────────────────────────────────────────────────────────────────

export type TriggerN8nWorkflowStatus = "triggered" | "not_configured" | "error";

export interface TriggerN8nWorkflowInput {
  workflowId: string;
}

export interface TriggerN8nWorkflowOutput {
  status: TriggerN8nWorkflowStatus;
  workflowId: string;
  tier: N8nTier | "unknown";
  /** Approval policy for this workflow at server-allowlist time. */
  approvalRequired: boolean;
  /** Echo of n8n's execution id when the API exposes it. */
  executionId?: string;
  /** Free-form diagnostic when status != 'triggered'. */
  note?: string;
}

/**
 * Triggers a workflow on-demand via n8n's REST API (`POST
 * /api/v1/workflows/{id}/run`). Tier A passes through immediately. Tier C
 * requires the caller to have already collected approval — server returns
 * `approvalRequired: true` in the response either way so the audit-trail can
 * verify it. Tier B/D and unknown workflows fail closed with
 * `N8nAllowlistError`.
 */
export async function triggerN8nWorkflow(
  input: TriggerN8nWorkflowInput,
): Promise<TriggerN8nWorkflowOutput> {
  const allowlist = await loadN8nAllowlist();
  const meta = allowlist.workflows[input.workflowId];
  const tier: N8nTier | "unknown" = meta?.tier ?? "unknown";

  if (tier === "unknown") {
    throw new N8nAllowlistError({
      workflowId: input.workflowId,
      tier,
      op: "trigger",
      message: `workflow ${input.workflowId} is not in n8n-allowlist.json; refuse to trigger`,
    });
  }
  if (tier === "B" || tier === "D") {
    throw new N8nAllowlistError({
      workflowId: input.workflowId,
      tier,
      op: "trigger",
      message: `workflow ${input.workflowId} is Tier ${tier} — not triggerable from the agent (B = digest-only, D = webhook-driven)`,
    });
  }

  const creds = readN8nCreds();
  const approvalRequired = meta?.approvalRequired === true || tier === "C";
  if (!creds) {
    return {
      status: "not_configured",
      workflowId: input.workflowId,
      tier,
      approvalRequired,
      note: "N8N_API_URL / N8N_API_KEY not configured; workflow not triggered.",
    };
  }

  const url = `${creds.baseUrl}/api/v1/workflows/${encodeURIComponent(input.workflowId)}/run`;
  const res = await n8nFetch(url, {
    method: "POST",
    apiKey: creds.apiKey,
    body: JSON.stringify({}),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      status: "error",
      workflowId: input.workflowId,
      tier,
      approvalRequired,
      note: `n8n API POST /workflows/${input.workflowId}/run returned HTTP ${res.status}: ${text.slice(0, 200)}`,
    };
  }

  let executionId: string | undefined;
  try {
    const body = JSON.parse(text) as {
      data?: { executionId?: string | number };
      executionId?: string | number;
    };
    const raw = body?.data?.executionId ?? body?.executionId;
    if (raw != null) executionId = String(raw);
  } catch {
    // n8n versions vary; treat unparseable response as success without id.
  }

  return {
    status: "triggered",
    workflowId: input.workflowId,
    tier,
    approvalRequired,
    ...(executionId ? { executionId } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// activate_n8n_workflow
// ─────────────────────────────────────────────────────────────────────────

export type ActivateN8nWorkflowStatus =
  | "activated"
  | "deactivated"
  | "not_configured"
  | "error";

export interface ActivateN8nWorkflowInput {
  workflowId: string;
  active: boolean;
}

export interface ActivateN8nWorkflowOutput {
  status: ActivateN8nWorkflowStatus;
  workflowId: string;
  tier: N8nTier | "unknown";
  approvalRequired: boolean;
  note?: string;
}

/**
 * Activates or deactivates a workflow. Always approval-gated (Tier C
 * semantics, even for Tier A workflows — flipping a snapshot's active flag
 * still requires founder sign-off so morning briefings don't silently
 * disappear). Tier B/D and unknown workflows fail closed.
 *
 * Locked decision #3 forbids delete; this endpoint never DELETE-s a
 * workflow, only POST-s the activate / deactivate endpoint pair.
 */
export async function activateN8nWorkflow(
  input: ActivateN8nWorkflowInput,
): Promise<ActivateN8nWorkflowOutput> {
  const allowlist = await loadN8nAllowlist();
  const meta = allowlist.workflows[input.workflowId];
  const tier: N8nTier | "unknown" = meta?.tier ?? "unknown";

  if (tier === "unknown" || tier === "B" || tier === "D") {
    throw new N8nAllowlistError({
      workflowId: input.workflowId,
      tier,
      op: "activate",
      message: `workflow ${input.workflowId} is ${tier === "unknown" ? "unknown" : `Tier ${tier}`} — not eligible for activate/deactivate from the agent`,
    });
  }

  const creds = readN8nCreds();
  if (!creds) {
    return {
      status: "not_configured",
      workflowId: input.workflowId,
      tier,
      approvalRequired: true,
      note: "N8N_API_URL / N8N_API_KEY not configured; workflow active flag unchanged.",
    };
  }

  const action = input.active ? "activate" : "deactivate";
  const url = `${creds.baseUrl}/api/v1/workflows/${encodeURIComponent(input.workflowId)}/${action}`;
  const res = await n8nFetch(url, {
    method: "POST",
    apiKey: creds.apiKey,
  });
  if (!res.ok) {
    return {
      status: "error",
      workflowId: input.workflowId,
      tier,
      approvalRequired: true,
      note: `n8n API POST /workflows/${input.workflowId}/${action} returned HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
    };
  }

  return {
    status: input.active ? "activated" : "deactivated",
    workflowId: input.workflowId,
    tier,
    approvalRequired: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// refresh_business_snapshot (meta-tool)
// ─────────────────────────────────────────────────────────────────────────

export interface RefreshBusinessSnapshotInput {
  /**
   * Optional subset of Tier A workflow ids to fire. When omitted, every
   * Tier A workflow from `n8n-allowlist.json` is triggered in parallel.
   */
  workflowIds?: string[] | undefined;
}

export interface RefreshBusinessSnapshotResult {
  workflowId: string;
  name: string;
  status: TriggerN8nWorkflowStatus | "skipped";
  note?: string;
  executionId?: string;
}

export interface RefreshBusinessSnapshotOutput {
  triggered: number;
  failed: number;
  notConfigured: boolean;
  durationMs: number;
  results: RefreshBusinessSnapshotResult[];
}

/**
 * Fires all Tier A workflows in parallel and waits for n8n to acknowledge
 * each `run` call. The actual snapshot data lands in our DB asynchronously
 * once n8n executes the workflow; this function returns as soon as every
 * trigger call resolves, so callers should re-read `growth.*` / etc. tables
 * a few seconds after this returns.
 */
export async function refreshBusinessSnapshot(
  input: RefreshBusinessSnapshotInput = {},
): Promise<RefreshBusinessSnapshotOutput> {
  const allowlist = await loadN8nAllowlist();
  const tierA = Object.entries(allowlist.workflows).filter(
    ([, meta]) => meta.tier === "A",
  );
  const filter = input.workflowIds ? new Set(input.workflowIds) : null;
  const targets = (filter ? tierA.filter(([id]) => filter.has(id)) : tierA).map(
    ([id, meta]) => ({ id, meta }),
  );

  const startedAt = Date.now();
  const results: RefreshBusinessSnapshotResult[] = await Promise.all(
    targets.map(async ({ id, meta }) => {
      try {
        const out = await triggerN8nWorkflow({ workflowId: id });
        return {
          workflowId: id,
          name: meta.name,
          status: out.status,
          ...(out.note ? { note: out.note } : {}),
          ...(out.executionId ? { executionId: out.executionId } : {}),
        };
      } catch (err) {
        return {
          workflowId: id,
          name: meta.name,
          status: "error" as const,
          note: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  const notConfigured =
    results.length > 0 && results.every((r) => r.status === "not_configured");
  const triggered = results.filter((r) => r.status === "triggered").length;
  const failed = results.filter(
    (r) => r.status === "error" || r.status === "not_configured",
  ).length;

  return {
    triggered,
    failed,
    notConfigured,
    durationMs: Date.now() - startedAt,
    results,
  };
}
