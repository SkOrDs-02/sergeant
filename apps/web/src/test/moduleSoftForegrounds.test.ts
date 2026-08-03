/**
 * Status: Active
 * Guards the design-system contract for module-tinted soft surfaces.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES = ["finyk", "fizruk", "routine", "nutrition"] as const;

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (
      [".ts", ".tsx"].includes(extname(entry)) &&
      !entry.includes(".test.") &&
      !entry.includes(".spec.")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("module soft foreground contract", () => {
  it("does not pair a soft module fill with static light-theme ink", () => {
    const sourceRoot = join(process.cwd(), "src");
    const offenders = collectSourceFiles(sourceRoot).flatMap((file) => {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      return lines.flatMap((line, index) => {
        if (/^\s*(?:\/\/|\*)/.test(line)) return [];
        return MODULES.flatMap((module) => {
          const surface =
            module === "routine"
              ? /(?:^|[\s"'])bg-routine-(?:soft|surface)(?:\s|["'])/
              : new RegExp(`(?:^|[\\s"'])bg-${module}-soft(?:\\s|["'])`);
          const staticInk = new RegExp(
            `(?:text-${module}-strong|dark:text-${module}(?:-300)?)`,
          );
          return surface.test(line) && staticInk.test(line)
            ? [`${relative(process.cwd(), file)}:${index + 1}`]
            : [];
        });
      });
    });

    expect(offenders).toEqual([]);
  });
});
