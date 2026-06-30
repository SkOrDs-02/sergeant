import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../..");
const repoRoot = resolve(webRoot, "../..");
const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function spawnLogged(args, options = {}) {
  const command = isWindows ? "cmd.exe" : pnpm;
  const commandArgs = isWindows
    ? ["/d", "/s", "/c", ["pnpm", ...args].join(" ")]
    : args;
  const child = spawn(command, commandArgs, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    ...options,
  });
  children.push(child);
  return child;
}

function runOnce(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawnLogged(args);
    child.on("exit", (code, signal) => {
      const index = children.indexOf(child);
      if (index >= 0) children.splice(index, 1);
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(
        new Error(
          `${pnpm} ${args.join(" ")} exited with ${code ?? signal ?? "unknown"}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

function runCapture(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun(stdout.trim());
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            code ?? signal ?? "unknown"
          }: ${stderr.trim()}`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function waitForPostgresHealth() {
  const deadline = Date.now() + 60_000;
  let lastStatus = "unknown";

  while (Date.now() < deadline) {
    try {
      lastStatus = await runCapture("docker", [
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
        "hub-postgres",
      ]);
      if (lastStatus === "healthy") return;
    } catch (err) {
      lastStatus = err instanceof Error ? err.message : String(err);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }

  throw new Error(`hub-postgres did not become healthy: ${lastStatus}`);
}

async function waitForHttp(url, label, child) {
  const deadline = Date.now() + 60_000;
  let lastStatus = "unknown";

  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`${label} exited before becoming ready`);
    }

    try {
      const response = await fetch(url);
      lastStatus = `${response.status} ${response.statusText}`;
      if (response.ok) return;
    } catch (err) {
      lastStatus = err instanceof Error ? err.message : String(err);
    }

    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastStatus}`);
}

function stopChildren() {
  for (const child of [...children].reverse()) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopChildren();
  process.exit(143);
});
process.on("exit", stopChildren);

try {
  await runOnce(["db:up"]);
  await waitForPostgresHealth();
  await runOnce(["--filter", "@sergeant/db-schema", "build"]);
  await runOnce(["--filter", "@sergeant/server", "db:migrate:dev"]);
  const api = spawnLogged(["--filter", "@sergeant/server", "dev"]);
  await waitForHttp("http://127.0.0.1:3000/health", "API server", api);
  await runOnce(["--filter", "@sergeant/web", "build"]);
  const preview = spawnLogged([
    "--filter",
    "@sergeant/web",
    "preview",
    "--",
    "--port",
    "4173",
    "--host",
    "127.0.0.1",
  ]);
  preview.on("exit", (code, signal) => {
    stopChildren();
    process.exit(code ?? (signal ? 1 : 0));
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  stopChildren();
  process.exit(1);
}
