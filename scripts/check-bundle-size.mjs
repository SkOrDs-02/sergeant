#!/usr/bin/env node
/**
 * Bundle Size Budget Check
 *
 * Analyzes the production build output and enforces size budgets.
 * Run after `pnpm build:web` to check bundle sizes.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs
 *   node scripts/check-bundle-size.mjs --json  # Output JSON for CI
 *
 * Exit codes:
 *   0 - All bundles within budget
 *   1 - One or more bundles exceed budget
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_PATH = join(__dirname, "../apps/web/dist/assets");

// Budget definitions (in KB, gzipped estimates)
const BUDGETS = {
  // Main entry chunks
  "index-": { maxSize: 80, description: "Main entry" },

  // React vendor chunk
  "react-": { maxSize: 50, description: "React runtime" },

  // Router chunk
  "router-": { maxSize: 25, description: "React Router" },

  // Module chunks (lazy loaded)
  "finyk-": { maxSize: 150, description: "Finyk module" },
  "fizruk-": { maxSize: 180, description: "Fizruk module" },
  "routine-": { maxSize: 120, description: "Routine module" },
  "nutrition-": { maxSize: 100, description: "Nutrition module" },

  // Vendor chunks
  "sentry-": { maxSize: 80, description: "Sentry SDK" },
  "virtuoso-": { maxSize: 40, description: "Virtuoso list" },
  "recharts-": { maxSize: 120, description: "Recharts library" },
  "tanstack-": { maxSize: 30, description: "TanStack Query" },

  // Total JS budget
  _total: { maxSize: 500, description: "Total initial JS" },
};

// Gzip compression ratio estimate (actual gzip is ~30-40% of original)
const GZIP_RATIO = 0.35;

function formatSize(bytes) {
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatGzipSize(bytes) {
  return formatSize(bytes * GZIP_RATIO);
}

function getChunkCategory(filename) {
  for (const [prefix, config] of Object.entries(BUDGETS)) {
    if (prefix === "_total") continue;
    if (filename.startsWith(prefix)) {
      return { prefix, ...config };
    }
  }
  return null;
}

function analyzeBundle() {
  let files;
  try {
    files = readdirSync(DIST_PATH);
  } catch {
    console.error("❌ Build output not found. Run `pnpm build:web` first.");
    process.exit(1);
  }

  const jsFiles = files
    .filter((f) => f.endsWith(".js") && !f.endsWith(".map"))
    .map((f) => {
      const fullPath = join(DIST_PATH, f);
      const stats = statSync(fullPath);
      return {
        name: f,
        size: stats.size,
        gzipSize: Math.round(stats.size * GZIP_RATIO),
        category: getChunkCategory(f),
      };
    })
    .sort((a, b) => b.size - a.size);

  const totalSize = jsFiles.reduce((sum, f) => sum + f.size, 0);
  const totalGzip = Math.round(totalSize * GZIP_RATIO);

  return { files: jsFiles, totalSize, totalGzip };
}

function checkBudgets(analysis) {
  const violations = [];
  const results = [];

  // Check individual chunks
  for (const file of analysis.files) {
    if (file.category) {
      const gzipKB = file.gzipSize / 1024;
      const overBudget = gzipKB > file.category.maxSize;

      results.push({
        name: file.name,
        description: file.category.description,
        size: file.size,
        gzipSize: file.gzipSize,
        budget: file.category.maxSize * 1024,
        overBudget,
      });

      if (overBudget) {
        violations.push({
          chunk: file.category.description,
          actual: gzipKB.toFixed(1),
          budget: file.category.maxSize,
          diff: (gzipKB - file.category.maxSize).toFixed(1),
        });
      }
    }
  }

  // Check total budget
  const totalGzipKB = analysis.totalGzip / 1024;
  const totalBudget = BUDGETS._total.maxSize;
  if (totalGzipKB > totalBudget) {
    violations.push({
      chunk: "Total initial JS",
      actual: totalGzipKB.toFixed(1),
      budget: totalBudget,
      diff: (totalGzipKB - totalBudget).toFixed(1),
    });
  }

  return { results, violations, totalGzipKB, totalBudget };
}

function printReport(analysis, budgetCheck) {
  const isJson = process.argv.includes("--json");

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          files: analysis.files.map((f) => ({
            name: f.name,
            size: f.size,
            gzipSize: f.gzipSize,
            category: f.category?.description || "uncategorized",
          })),
          total: {
            size: analysis.totalSize,
            gzipSize: analysis.totalGzip,
          },
          violations: budgetCheck.violations,
          passed: budgetCheck.violations.length === 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\n📦 Bundle Size Analysis\n");
  console.log("─".repeat(60));

  // Print categorized chunks
  console.log("\n📊 Chunk Breakdown (gzipped estimates):\n");

  for (const result of budgetCheck.results) {
    const status = result.overBudget ? "🔴" : "🟢";
    const budgetInfo = `(budget: ${formatSize(result.budget)})`;
    console.log(
      `${status} ${result.description.padEnd(20)} ${formatGzipSize(result.size).padStart(10)} ${budgetInfo}`,
    );
  }

  // Print uncategorized chunks
  const uncategorized = analysis.files.filter((f) => !f.category);
  if (uncategorized.length > 0) {
    console.log("\n📁 Other chunks:");
    for (const file of uncategorized.slice(0, 10)) {
      console.log(
        `   ${file.name.substring(0, 30).padEnd(32)} ${formatGzipSize(file.size).padStart(10)}`,
      );
    }
    if (uncategorized.length > 10) {
      console.log(`   … and ${uncategorized.length - 10} more`);
    }
  }

  // Print total
  console.log("\n" + "─".repeat(60));
  const totalStatus =
    budgetCheck.totalGzipKB <= budgetCheck.totalBudget ? "🟢" : "🔴";
  console.log(
    `${totalStatus} Total JS (gzipped): ${formatSize(analysis.totalGzip)} / ${formatSize(budgetCheck.totalBudget * 1024)}`,
  );

  // Print violations summary
  if (budgetCheck.violations.length > 0) {
    console.log("\n⚠️  Budget Violations:\n");
    for (const v of budgetCheck.violations) {
      console.log(
        `   • ${v.chunk}: ${v.actual} KB (budget: ${v.budget} KB, +${v.diff} KB)`,
      );
    }
    console.log("\n");
  } else {
    console.log("\n✅ All bundles within budget!\n");
  }
}

// Main
const analysis = analyzeBundle();
const budgetCheck = checkBudgets(analysis);

printReport(analysis, budgetCheck);

// Exit with error code if violations
process.exit(budgetCheck.violations.length > 0 ? 1 : 0);
