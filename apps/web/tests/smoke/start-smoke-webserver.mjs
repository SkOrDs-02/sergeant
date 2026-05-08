import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../..");
const repoRoot = resolve(webRoot, "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function spawnLogged(args, options = {}) {
  const child = spawn(pnpm, args, {
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
  await runOnce(["--filter", "@sergeant/server", "db:migrate:dev"]);
  spawnLogged(["--filter", "@sergeant/server", "dev"]);
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
