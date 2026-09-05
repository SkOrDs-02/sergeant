// Status: Active — CLI обліку, без виконання команд з метаданих.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, parse, resolve } from "node:path";
import * as schema from "./schema.mjs";
import { report, compare } from "./reports.mjs";

function argumentsFor(argv) {
  const [command, ...args] = argv,
    options = {};
  const allowed = {
    list: ["suite", "module", "mode"],
    init: ["id", "metadata", "suite", "module", "mode"],
    record: ["run", "input"],
    validate: ["run", "catalog-only"],
    report: ["run"],
    compare: ["before", "after"],
    close: ["run"],
  };
  schema.check(
    command in allowed,
    "Use list, init, record, validate, report, compare, or close",
  );
  for (let i = 0; i < args.length; i++) {
    const key = args[i].startsWith("--") ? args[i].slice(2) : "";
    schema.check(
      key === "root" || allowed[command].includes(key),
      `Unknown option ${args[i]}`,
    );
    schema.check(!(key in options), `Duplicate option --${key}`);
    if (key === "catalog-only") options[key] = true;
    else {
      schema.check(
        args[i + 1] && !args[i + 1].startsWith("--"),
        `Missing value for --${key}`,
      );
      options[key] = args[++i];
    }
  }
  schema.check(
    !(options.run && options["catalog-only"]),
    "--run and --catalog-only cannot be combined",
  );
  return { command, options };
}
function noSymlinks(path) {
  let current = resolve(path);
  while (current !== parse(current).root) {
    if (existsSync(current))
      schema.check(
        !lstatSync(current).isSymbolicLink(),
        `Symlink not allowed for run storage: ${current}`,
      );
    current = dirname(current);
  }
}
function atomicWrite(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temp, path);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}
function locked(path, fn) {
  noSymlinks(path);
  mkdirSync(dirname(path), { recursive: true });
  const lock = `${path}.lock`;
  let descriptor;
  try {
    descriptor = openSync(lock, "wx");
  } catch {
    throw new Error(
      `Run is locked: ${lock}; verify no writer is active before removing a stale lock`,
    );
  }
  try {
    return fn();
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}
function main(argv) {
  const { command, options: o } = argumentsFor(argv),
    root = resolve(o.root ?? process.cwd());
  const catalog = schema.catalog(
    schema.json(
      resolve(root, "docs/02-engineering/testing/verification/catalog.json"),
    ),
    root,
  );
  const registry = schema.findings(
    schema.json(
      resolve(root, "docs/90-work/audits/verification/findings.json"),
    ),
    root,
  );
  const runs = resolve(root, "docs/90-work/audits/verification/runs");
  const pathFor = (id) => {
    schema.id(id, "run ID");
    const path = resolve(runs, id, "run.json");
    noSymlinks(path);
    return path;
  };
  const read = (id) => {
    const v = schema.json(pathFor(id));
    schema.check(v.id === id, "Run ID differs from directory");
    return v;
  };
  const validate = (run, checksums = true) => {
    schema.runSchema(run, root, registry, { checksums });
    if (run.metadata.baseline !== null) {
      schema.check(
        run.metadata.baseline !== run.id,
        "Run cannot be its own baseline",
      );
      read(run.metadata.baseline);
    }
    return run;
  };
  const verifyFindings = () => {
    for (const f of registry.findings.filter((f) => f.status === "verified")) {
      const r = validate(read(f.verification.runId)),
        attempt = r.attempts.find((a) => a.id === f.verification.attemptId);
      schema.check(
        r.kind === "live" &&
          attempt?.status === "pass" &&
          attempt.findingIds.includes(f.id) &&
          schema.latest(r).get(attempt.scenarioId)?.id === attempt.id,
        `Invalid verified finding ${f.id}: requires latest live pass linked to finding`,
      );
    }
  };
  const select = () => {
    if (o.suite)
      schema.check(
        catalog.suites.some((s) => s.id === o.suite),
        `Unknown suite ${o.suite}`,
      );
    if (o.module)
      schema.check(
        catalog.scenarios.some((s) => s.modules.includes(o.module)),
        `Unknown module ${o.module}`,
      );
    if (o.mode)
      schema.check(
        ["smoke", "full", "pilot"].includes(o.mode),
        `Unknown mode ${o.mode}`,
      );
    const chosen = catalog.scenarios.filter(
      (s) =>
        (!o.suite || s.suite === o.suite) &&
        (!o.module || s.modules.includes(o.module)) &&
        (!o.mode || o.mode === "full" || s.modes.includes(o.mode)),
    );
    schema.check(chosen.length, "No scenarios selected");
    return chosen;
  };
  if (command === "list")
    return select()
      .map((s) => `${s.id}\t${s.suite}\tr${s.revision}\t${s.title}`)
      .join("\n");
  if (command === "init") {
    schema.text(o.metadata, "--metadata");
    const path = pathFor(o.id),
      metadata = schema.json(resolve(root, o.metadata));
    if (metadata.commit === undefined)
      metadata.commit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    if (metadata.dirty === undefined)
      metadata.dirty = Boolean(
        execFileSync("git", ["status", "--porcelain"], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim(),
      );
    const kind = metadata.kind ?? "live";
    delete metadata.kind;
    const run = validate({
      schemaVersion: 1,
      id: o.id,
      status: "open",
      createdAt: new Date().toISOString(),
      kind,
      metadata,
      scenarios: select(),
      attempts: [],
    });
    noSymlinks(runs);
    mkdirSync(runs, { recursive: true });
    // mkdir is exclusive: a concurrent init cannot overwrite an existing run or handoff.
    mkdirSync(dirname(path));
    atomicWrite(path, run);
    writeFileSync(
      resolve(dirname(path), "handoff.md"),
      "# Передача прогону\n\n> **Status:** Active\n\n- Виконано: прогін ініціалізовано; сценарії ще не виконані.\n- Стан акаунтів і seed:\n- Блокери та докази:\n- Наступна точна команда/крок:\n- Нюанси й невдалі підходи:\n",
      { flag: "wx" },
    );
    return path;
  }
  if (command === "record") {
    schema.text(o.input, "--input");
    const path = pathFor(o.run);
    return locked(path, () => {
      const run = validate(read(o.run));
      schema.check(run.status === "open", "Cannot record a closed run");
      const attempt = schema.json(resolve(root, o.input));
      schema.object(attempt, "attempt input");
      attempt.id ??= `a-${randomUUID()}`;
      attempt.at ??= new Date().toISOString();
      attempt.reason ??= "";
      attempt.metrics ??= {};
      attempt.findingIds ??= [];
      attempt.evidence ??= [];
      schema.array(attempt.evidence, "evidence", true);
      for (const e of attempt.evidence) {
        schema.object(e, "evidence");
        schema.text(e.path, "evidence.path");
        e.sha256 ??= schema.sha(resolve(root, e.path));
      }
      run.attempts.push(attempt);
      validate(run);
      atomicWrite(path, run);
      return attempt.id;
    });
  }
  if (command === "validate") {
    if (!o["catalog-only"]) {
      verifyFindings();
      const ids = o.run
        ? [o.run]
        : existsSync(runs)
          ? readdirSync(runs, { withFileTypes: true })
              .filter((e) => e.isDirectory() || e.isSymbolicLink())
              .map((e) => e.name)
          : [];
      ids.forEach((id) => validate(read(id)));
    }
    return `verification: valid (${o["catalog-only"] ? "catalog and registry structure only; live links/artifacts skipped" : "catalog, registry, runs and evidence"})`;
  }
  if (command === "report")
    return report(validate(read(o.run), false), registry, root);
  if (command === "compare")
    return compare(
      validate(read(o.before), false),
      validate(read(o.after), false),
      root,
    );
  if (command === "close")
    return locked(pathFor(o.run), () => {
      const run = validate(read(o.run));
      schema.check(run.status === "open", "Run already closed");
      verifyFindings();
      run.status = "closed";
      run.closedAt = new Date().toISOString();
      run.outcome = schema.outcome(run);
      validate(run);
      atomicWrite(pathFor(o.run), run);
      return run.outcome;
    });
}
try {
  process.stdout.write(`${main(process.argv.slice(2))}\n`);
} catch (err) {
  process.stderr.write(`verification: ${err.message}\n`);
  process.exitCode = 1;
}
