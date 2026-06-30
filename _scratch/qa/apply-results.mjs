// Apply Phase-2/3/4 test results into the canonical CSV by ID.
// Usage: node apply-results.mjs results.json
// results.json: { "FIN-02": { p2: "PASS", err: "", fix: "", p4: "", note: "" }, ... }
// Only provided fields overwrite; omitted fields are left untouched.
import { readFileSync, writeFileSync } from "node:fs";

const csvPath = new URL("./feature-stories.csv", import.meta.url);
const resultsPath = process.argv[2];
if (!resultsPath) throw new Error("pass results.json path");
const results = JSON.parse(readFileSync(resultsPath, "utf8"));

const raw = readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/);
const header = lines[0];

function parse(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
function quote(f) {
  return /[",\n]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f;
}
const COL = { p2: 7, err: 8, fix: 9, p4: 10, note: 11 };

let applied = 0;
const outLines = [header];
for (let i = 1; i < lines.length; i++) {
  if (!lines[i].trim()) { outLines.push(lines[i]); continue; }
  const f = parse(lines[i]);
  const id = f[0];
  const r = results[id];
  if (r) {
    for (const key of Object.keys(COL)) {
      if (r[key] !== undefined) f[COL[key]] = r[key];
    }
    applied++;
  }
  outLines.push(f.map(quote).join(","));
}
writeFileSync(csvPath, outLines.join("\n"));
console.log(`applied ${applied}/${Object.keys(results).length} result rows`);
