#!/usr/bin/env node
// scripts/agent/embed-chunks.mjs
//
// Embed the retrieval manifest chunks into the out-of-git vector cache
// (`.cache/retrieval/vectors.json`) so `pnpm agent:find` can rank semantically.
// Only chunks whose contentHash is missing from the cache are re-embedded, so
// repeat runs cost almost nothing (Initiative 0018 Phase 2).
//
// This is a manual / cron step, NOT a CI gate — it needs VOYAGE_API_KEY and the
// network. Without a key it exits 0 with a notice; `agent:find` then stays in
// lexical mode. See docs/04-governance/adr/0066-agent-semantic-retrieval-over-knowledge-graph.md.
//
// Usage:
//   VOYAGE_API_KEY=… pnpm agent:embed            # embed missing chunks
//   VOYAGE_API_KEY=… pnpm agent:embed --rebuild  # drop cache and re-embed all

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMBEDDING_DIM,
  EMBEDDING_MODEL,
  embedTexts,
  hasApiKey,
  loadVectorCache,
  REPO_ROOT,
  saveVectorCache,
} from "./voyage.mjs";

const INDEX_PATH = resolve(
  REPO_ROOT,
  "docs/04-governance/governance/retrieval-index.json",
);

async function main() {
  const rebuild = process.argv.slice(2).includes("--rebuild");

  if (!hasApiKey()) {
    console.log(
      "VOYAGE_API_KEY not set — skipping embedding. `agent:find` will use lexical mode.",
    );
    process.exit(0);
  }

  const manifest = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const cache =
    !rebuild && loadVectorCache()?.model === EMBEDDING_MODEL
      ? loadVectorCache()
      : { model: EMBEDDING_MODEL, dim: EMBEDDING_DIM, vectors: {} };

  // Only embed chunks whose contentHash isn't cached yet.
  const pending = manifest.chunks.filter((c) => !cache.vectors[c.contentHash]);
  if (pending.length === 0) {
    console.log(
      `Vector cache up to date — ${Object.keys(cache.vectors).length} vectors.`,
    );
    process.exit(0);
  }

  console.log(
    `Embedding ${pending.length} chunk(s) via ${EMBEDDING_MODEL} (${EMBEDDING_DIM}-d)…`,
  );
  const vectors = await embedTexts(
    pending.map((c) => `${c.title}\n${c.text}`),
    { inputType: "document" },
  );
  pending.forEach((c, i) => {
    if (vectors[i]) cache.vectors[c.contentHash] = vectors[i];
  });

  // Prune vectors for chunks that no longer exist (content drift).
  const liveHashes = new Set(manifest.chunks.map((c) => c.contentHash));
  for (const hash of Object.keys(cache.vectors)) {
    if (!liveHashes.has(hash)) delete cache.vectors[hash];
  }

  saveVectorCache(cache);
  console.log(
    `Wrote ${Object.keys(cache.vectors).length} vectors to .cache/retrieval/vectors.json.`,
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
