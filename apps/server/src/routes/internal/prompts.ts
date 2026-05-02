import { Router } from "express";
import { readFile } from "fs/promises";
import { join, normalize, dirname } from "path";
import { fileURLToPath } from "url";
import { asyncHandler } from "../../http/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_ROOT = join(__dirname, "../../ai-prompts");

export function createPromptsInternalRouter(): Router {
  const r = Router();

  r.get(
    "/api/internal/prompts/:namespace/:slug",
    asyncHandler(async (req, res) => {
      const { namespace, slug } = req.params as {
        namespace: string;
        slug: string;
      };

      // Prevent path traversal: only allow safe path segments
      if (
        !namespace ||
        !slug ||
        /[^a-z0-9\-_]/.test(namespace) ||
        /[^a-z0-9\-_]/.test(slug)
      ) {
        res.status(400).json({ error: "Invalid prompt slug" });
        return;
      }

      const filePath = normalize(join(PROMPTS_ROOT, namespace, `${slug}.md`));

      // Guard: resolved path must stay within PROMPTS_ROOT
      if (!filePath.startsWith(PROMPTS_ROOT)) {
        res.status(400).json({ error: "Invalid prompt path" });
        return;
      }

      try {
        const content = await readFile(filePath, "utf-8");
        res.setHeader("Content-Type", "text/markdown; charset=utf-8");
        res.send(content);
      } catch {
        res.status(404).json({ error: "Prompt not found" });
      }
    }),
  );

  return r;
}
