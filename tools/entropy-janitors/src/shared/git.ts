import { spawn } from "node:child_process";
import { logger } from "./logger.js";

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export function runCapture(
  command: string,
  args: readonly string[],
  options: { cwd: string; timeoutMs?: number },
): Promise<RunResult> {
  return new Promise((resolveP, rejectP) => {
    const started = Date.now();
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          rejectP(
            new Error(
              `Command timed out after ${options.timeoutMs}ms: ${command}`,
            ),
          );
        }, options.timeoutMs)
      : null;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      rejectP(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolveP({
        code: code ?? 0,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

export function runGh(args: readonly string[]): Promise<RunResult> {
  return runCapture("gh", args, { cwd: process.cwd() });
}

export async function ghIssueExists(title: string): Promise<boolean> {
  try {
    const result = await runGh([
      "issue",
      "list",
      "--state",
      "open",
      "--search",
      `in:title ${JSON.stringify(title)}`,
      "--json",
      "number",
      "--limit",
      "1",
    ]);
    if (result.code !== 0) {
      logger.warn("gh issue search failed", { stderr: result.stderr });
      return false;
    }
    const parsed = JSON.parse(result.stdout || "[]") as Array<{
      number: number;
    }>;
    return parsed.length > 0;
  } catch (err) {
    logger.warn("gh not available, skipping dedup", { error: String(err) });
    return false;
  }
}
