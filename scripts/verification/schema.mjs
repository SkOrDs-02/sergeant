// Status: Active — повторюваний облік верифікації, без запуску тестових команд.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export function check(ok, message) {
  if (!ok) throw new Error(message);
}
export function object(v, label) {
  check(
    v !== null && typeof v === "object" && !Array.isArray(v),
    `${label}: expected object`,
  );
}
export function text(v, label) {
  check(
    typeof v === "string" && v.trim().length > 0,
    `${label}: expected nonempty text`,
  );
}
export function id(v, label = "ID") {
  text(v, label);
  check(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(v) &&
      !v.includes("..") &&
      !v.endsWith(".") &&
      !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(v),
    `Unsafe ${label}: ${v}`,
  );
}
export function array(v, label, empty = false) {
  check(
    Array.isArray(v) && (empty || v.length > 0),
    `${label}: expected ${empty ? "" : "nonempty "}array`,
  );
}
function strings(v, label, empty = false) {
  array(v, label, empty);
  v.forEach((x) => text(x, label));
}
export function date(v, label) {
  text(v, label);
  check(
    /^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(v) && Number.isFinite(Date.parse(v)),
    `${label}: invalid date`,
  );
}
export function unique(values, label) {
  check(new Set(values).size === values.length, `Duplicate ${label}`);
}
export function json(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}
export function sha(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function repoPath(root, value) {
  text(value, "source");
  check(
    !isAbsolute(value) && !/^[a-z]:/i.test(value),
    `Source must be repo-relative: ${value}`,
  );
  const file = resolve(root, value.split("#")[0]);
  const rel = relative(root, file);
  check(
    rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel),
    `Source escapes root: ${value}`,
  );
  check(
    existsSync(file) && statSync(file).isFile(),
    `Source missing: ${value}`,
  );
  const real = relative(realpathSync(root), realpathSync(file));
  check(
    real !== ".." && !real.startsWith(`..${sep}`) && !isAbsolute(real),
    `Source symlink escapes root: ${value}`,
  );
  return file;
}
export function scenario(s, root, suites) {
  object(s, "scenario");
  id(s.id, "scenario ID");
  for (const key of [
    "title",
    "suite",
    "source",
    "preconditions",
    "cleanup",
    "pitfalls",
  ])
    text(s[key], `Scenario ${s.id}.${key}`);
  check(
    Number.isInteger(s.revision) && s.revision > 0,
    `Invalid revision ${s.id}`,
  );
  if (suites) check(suites.has(s.suite), `Unknown suite ${s.suite}`);
  for (const key of [
    "modules",
    "modes",
    "profiles",
    "steps",
    "expected",
    "evidence",
  ])
    strings(s[key], `Scenario ${s.id}.${key}`, key === "profiles");
  for (const mode of s.modes)
    check(["smoke", "full", "pilot"].includes(mode), `Unknown mode ${mode}`);
  repoPath(root, s.source);
}
export function catalog(c, root) {
  object(c, "catalog");
  check(c.schemaVersion === 1, "Invalid catalog schemaVersion");
  array(c.suites, "suites");
  array(c.scenarios, "scenarios");
  c.suites.forEach((s) => {
    object(s, "suite");
    id(s.id, "suite ID");
    text(s.title, "suite title");
  });
  unique(
    c.suites.map((s) => s.id),
    "suite ID",
  );
  unique(
    c.scenarios.map((s) => s.id),
    "scenario ID",
  );
  const suites = new Set(c.suites.map((s) => s.id));
  c.scenarios.forEach((s) => scenario(s, root, suites));
  for (const suite of suites)
    check(
      c.scenarios.some((s) => s.suite === suite),
      `Suite without scenarios: ${suite}`,
    );
  return c;
}
export function metadata(m) {
  object(m, "metadata");
  for (const key of [
    "executor",
    "commit",
    "deployment",
    "environment",
    "baseUrl",
    "browser",
    "timezone",
    "seedRevision",
  ])
    text(m[key], `Metadata ${key}`);
  check(typeof m.dirty === "boolean", "Metadata dirty must be boolean");
  let url;
  try {
    url = new URL(m.baseUrl);
  } catch {
    check(false, "Metadata baseUrl invalid");
  }
  check(
    ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password,
    "Metadata baseUrl must be HTTP(S) without credentials",
  );
  try {
    new Intl.DateTimeFormat("en", { timeZone: m.timezone });
  } catch {
    check(false, "Metadata timezone invalid");
  }
  if (typeof m.viewport === "string") text(m.viewport, "viewport");
  else {
    object(m.viewport, "viewport");
    for (const k of ["width", "height"])
      check(
        Number.isFinite(m.viewport[k]) && m.viewport[k] > 0,
        `viewport.${k} invalid`,
      );
  }
  object(m.flags, "flags");
  strings(m.accounts, "accounts", true);
  unique(m.accounts, "account alias");
  object(m.ai, "ai");
  for (const k of ["mode", "model"]) text(m.ai[k], `ai.${k}`);
  check(
    ["live", "mock", "none", "blocked"].includes(m.ai.mode),
    "Invalid ai.mode",
  );
  if (typeof m.ai.configuration === "string")
    text(m.ai.configuration, "ai.configuration");
  else object(m.ai.configuration, "ai.configuration");
  check(
    Number.isFinite(m.ai.budgetUsd) && m.ai.budgetUsd >= 0,
    "Invalid ai.budgetUsd",
  );
  check(
    m.baseline === null || typeof m.baseline === "string",
    "Metadata baseline required",
  );
  if (m.baseline !== null) id(m.baseline, "baseline");
}
export function findings(f, root) {
  object(f, "findings");
  check(f.schemaVersion === 1, "Invalid findings schemaVersion");
  array(f.findings, "findings", true);
  unique(
    f.findings.map((x) => x.id),
    "finding ID",
  );
  for (const item of f.findings) {
    object(item, "finding");
    id(item.id, "finding ID");
    for (const k of ["legacyId", "title", "severity", "source"])
      text(item[k], `Finding ${item.id}.${k}`);
    check(
      [
        "open",
        "fixed-pending-verification",
        "verified",
        "accepted",
        "duplicate",
      ].includes(item.status),
      `Invalid finding status ${item.id}`,
    );
    repoPath(root, item.source);
    array(item.history, `Finding ${item.id}.history`);
    for (const event of item.history) {
      object(event, "history event");
      date(event.at, "history date");
      text(event.note, "history note");
    }
    for (const k of ["sourceAnchor", "owner"])
      if (item[k] !== undefined) text(item[k], k);
    if (item.status === "verified") {
      object(item.verification, "verification");
      id(item.verification.runId, "verification runId");
      id(item.verification.attemptId, "verification attemptId");
    }
  }
  return f;
}
export function latest(run) {
  return new Map(run.attempts.map((a) => [a.scenarioId, a]));
}
export function outcome(run) {
  const last = latest(run),
    statuses = run.scenarios.map((s) => last.get(s.id)?.status ?? "not-run");
  if (statuses.some((s) => ["blocked", "not-run"].includes(s)))
    return "incomplete";
  return statuses.includes("fail") ? "failed" : "passed";
}
export function evidenceProblem(e, root) {
  try {
    check(
      sha(resolve(root, e.path)) === e.sha256,
      `Evidence checksum mismatch: ${e.path}`,
    );
    return null;
  } catch (err) {
    return `Evidence unavailable or changed: ${e.path} (${err.message})`;
  }
}
export function runSchema(run, root, registry, { checksums = true } = {}) {
  object(run, "run");
  check(run.schemaVersion === 1, "Invalid run schemaVersion");
  id(run.id, "run ID");
  check(["open", "closed"].includes(run.status), "Invalid run status");
  check(["live", "demo"].includes(run.kind), "Invalid run kind");
  date(run.createdAt, "createdAt");
  metadata(run.metadata);
  array(run.scenarios, "run scenarios");
  unique(
    run.scenarios.map((s) => s.id),
    "snapshot scenario ID",
  );
  run.scenarios.forEach((s) => scenario(s, root));
  array(run.attempts, "attempts", true);
  unique(
    run.attempts.map((a) => a.id),
    "attempt ID",
  );
  const ids = new Set(run.scenarios.map((s) => s.id)),
    findingIds = new Set(registry.findings.map((f) => f.id));
  let priorTime = Date.parse(run.createdAt);
  for (const a of run.attempts) {
    object(a, "attempt");
    id(a.id, "attempt ID");
    check(ids.has(a.scenarioId), `Unknown scenario ${a.scenarioId}`);
    date(a.at, "attempt at");
    check(
      Date.parse(a.at) >= priorTime,
      "Attempt times must be chronological after createdAt",
    );
    priorTime = Date.parse(a.at);
    check(
      ["pass", "fail", "blocked", "not-run", "not-applicable"].includes(
        a.status,
      ),
      `Invalid attempt status ${a.status}`,
    );
    text(a.actual, "attempt actual");
    check(typeof a.reason === "string", "Attempt reason required");
    if (!["pass", "fail"].includes(a.status))
      text(a.reason, "Attempt needs reason");
    array(a.evidence, "evidence", !["pass", "fail"].includes(a.status));
    object(a.metrics, "metrics");
    strings(a.findingIds, "findingIds", true);
    unique(a.findingIds, "attempt finding ID");
    for (const f of a.findingIds)
      check(findingIds.has(f), `Unknown finding ${f}`);
    for (const e of a.evidence) {
      object(e, "evidence");
      text(e.path, "evidence.path");
      text(e.type, "evidence.type");
      check(
        typeof e.sha256 === "string" && /^[a-f0-9]{64}$/.test(e.sha256),
        "Invalid evidence sha256",
      );
      if (checksums) {
        const problem = evidenceProblem(e, root);
        check(!problem, problem);
      }
    }
  }
  if (run.status === "closed") {
    date(run.closedAt, "closedAt");
    check(
      Date.parse(run.closedAt) >= priorTime,
      "closedAt before last attempt",
    );
    check(
      run.outcome === outcome(run),
      "Closed outcome disagrees with latest attempts",
    );
  } else
    check(
      run.closedAt === undefined && run.outcome === undefined,
      "Open run cannot have closedAt/outcome",
    );
  return run;
}
