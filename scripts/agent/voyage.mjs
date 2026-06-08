// scripts/agent/voyage.mjs
//
// Shared Voyage helpers for the agent retrieval layer (Initiative 0018 Phase 2).
// Mirrors the production ai-memory embedding config (voyage-3.5-lite, 1024-d)
// but as a standalone fetch — no server/DB coupling. Vectors are cached out of
// git in `.cache/retrieval/vectors.json`, keyed by chunk contentHash, so a
// re-embed only touches changed chunks.
//
// See apps/server/src/modules/ai-memory/embeddings.ts for the production client
// this is kept consistent with, and docs/04-governance/adr/0066-…md for the decoupling rationale.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, "../..");
export const CACHE_PATH = resolve(REPO_ROOT, ".cache/retrieval/vectors.json");

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
export const EMBEDDING_MODEL =
  process.env["VOYAGE_EMBEDDING_MODEL"] || "voyage-3.5-lite";
export const EMBEDDING_DIM = Number(
  process.env["VOYAGE_EMBEDDING_DIM"] || 1024,
);
const BATCH_SIZE = Number(process.env["VOYAGE_EMBED_BATCH"] || 96);

export function hasApiKey() {
  return Boolean(process.env["VOYAGE_API_KEY"]);
}

// Embed an array of texts. `inputType` is "document" when indexing chunks and
// "query" when embedding a search query — Voyage tunes the space per side.
// Retries on rate-limit / transient errors with backoff (mirrors the production
// ai-memory embeddings client) — also self-paces under Voyage's free-tier RPM cap.
export async function embedTexts(texts, { inputType = "document" } = {}) {
  const apiKey = process.env["VOYAGE_API_KEY"];
  if (!apiKey)
    throw new Error("VOYAGE_API_KEY is not set — semantic mode unavailable.");
  if (texts.length === 0) return [];

  const out = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatchWithRetry(apiKey, batch, inputType);
    for (const e of embeddings) out.push(e);
  }
  return out;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 6;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function embedBatchWithRetry(apiKey, batch, inputType) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: batch,
        model: EMBEDDING_MODEL,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
        output_dtype: "float",
      }),
    });
    if (response.ok) {
      const json = await response.json();
      return (json.data ?? []).map((row) => row.embedding);
    }
    const body = await response.text().catch(() => "");
    lastErr = new Error(
      `Voyage HTTP ${response.status}: ${body.slice(0, 160)}`,
    );
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw lastErr;
    }
    // 429 on the free tier means ~3 RPM — wait long enough to clear the window.
    const base = response.status === 429 ? 22_000 : 1_000;
    await sleep(base * attempt);
  }
  throw lastErr;
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Vector cache: { model, dim, vectors: { "<contentHash>": number[] } }.
export function loadVectorCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function saveVectorCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}
