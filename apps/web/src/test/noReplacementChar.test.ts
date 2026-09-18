import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".ts",
  ".tsx",
]);

const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extname(entry))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("UI copy encoding", () => {
  it("does not ship Unicode replacement characters in web source", () => {
    const offenders = collectSourceFiles(join(process.cwd(), "src")).flatMap(
      (file) => {
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        return lines.flatMap((line, index) =>
          line.includes(REPLACEMENT_CHAR)
            ? [`${relative(process.cwd(), file)}:${index + 1}`]
            : [],
        );
      },
    );

    expect(offenders).toEqual([]);
  });
});
