import { z } from "zod";
import type { Cassette } from "./cassette.js";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  manifest: z.object({
    model: z.string().min(1),
    recordedAt: z.string().datetime(),
    caseCount: z.number().int().positive(),
    systemPrefixSha: sha,
    toolsSha: sha,
    dataBlockSha: sha,
  }),
  cases: z
    .array(
      z.object({
        name: z.string().min(1),
        turns: z.array(
          z.object({
            blocks: z.array(
              z.object({
                type: z.string().min(1),
                id: z.string().optional(),
                name: z.string().optional(),
                text: z.string().optional(),
                input: z.unknown().optional(),
              }),
            ),
            fedResult: z.string().nullable(),
          }),
        ),
        error: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

/** Структурна помилка касети — помилка стенду, а не поразка моделі. */
export function validateCassette(
  raw: unknown,
  expectedModel?: string,
): asserts raw is Cassette {
  const parsed = schema.parse(raw);
  if (expectedModel !== undefined && parsed.manifest.model !== expectedModel) {
    throw new Error(
      `Cassette model mismatch: expected ${expectedModel}, got ${parsed.manifest.model}`,
    );
  }
  if (parsed.manifest.caseCount !== parsed.cases.length) {
    throw new Error(
      `Cassette caseCount mismatch: ${parsed.manifest.caseCount} != ${parsed.cases.length}`,
    );
  }
  const names = new Set<string>();
  for (const item of parsed.cases) {
    if (names.has(item.name))
      throw new Error(`Duplicate cassette case: ${item.name}`);
    names.add(item.name);
    if (item.turns.length === 0 && item.error === undefined) {
      throw new Error(
        `Empty cassette case without transport error: ${item.name}`,
      );
    }
    if (item.turns[0] && item.turns[0].fedResult !== null) {
      throw new Error(
        `First cassette turn must not have a tool result: ${item.name}`,
      );
    }
  }
}
