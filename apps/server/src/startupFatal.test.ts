import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("startupFatal", () => {
  it("друкує стартовий throw у stdout рядком fatal і виходить з кодом 1", () => {
    // Справжній дочірній процес: слухач `uncaughtException`, що не завершує
    // процес (так поводиться Sentry), відтворює умови німого деплою.
    const script = `
      await import(${JSON.stringify(pathToFileURL(path.join(here, "startupFatal.ts")).href)});
      process.on("uncaughtException", () => {});
      throw new Error("WEBHOOK_HMAC_SECRET is required");
    `;
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 20_000 },
    );

    expect(child.status).toBe(1);
    const line = child.stdout.trim().split("\n").at(-1) ?? "";
    const record = JSON.parse(line) as {
      level: string;
      msg: string;
      err: { message: string };
    };
    expect(record.level).toBe("fatal");
    expect(record.msg).toBe("startup_failed");
    expect(record.err.message).toBe("WEBHOOK_HMAC_SECRET is required");
  });

  it("імпортується в index.ts першим, до sentry та env-асертів", () => {
    const source = readFileSync(path.join(here, "index.ts"), "utf8");
    const firstImport = /^import .*$/m.exec(source)?.[0] ?? "";
    expect(firstImport).toContain('"./startupFatal.js"');
  });
});
