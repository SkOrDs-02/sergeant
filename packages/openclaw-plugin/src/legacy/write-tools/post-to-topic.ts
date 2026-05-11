/**
 * `post_to_topic` write-tool (PR-D Phase 4).
 *
 * Posts a message to a Telegram topic via server's
 * `/api/internal/openclaw/write/post-to-topic` endpoint.
 */

import { z } from "zod";
import {
  createWriteTool,
  type WriteToolFactoryOptions,
  type WriteToolParts,
} from "./write-tool-factory.js";

export const PostToTopicParamsSchema = z.object({
  topic: z
    .string()
    .min(1)
    .describe("Telegram topic name (e.g. 'product', 'engineering', 'general')"),
  text: z
    .string()
    .min(1)
    .max(4000)
    .describe("Message text (Telegram MarkdownV2 supported)"),
});

export type PostToTopicParams = z.infer<typeof PostToTopicParamsSchema>;

interface PostToTopicResponse {
  status: "posted" | "not_configured" | "error";
  messageId?: number;
  error?: string;
}

const TOOL_NAME = "post_to_topic";

export function createPostToTopicTool(
  opts: WriteToolFactoryOptions,
): WriteToolParts<PostToTopicParams> {
  return createWriteTool<PostToTopicParams, PostToTopicResponse>(
    {
      name: TOOL_NAME,
      description: `Post a message to a Telegram topic channel. WRITE TOOL —
gated behind founder approval. Use for: sharing updates, summaries, or
decisions to team-facing channels the founder specifies.`,
      parameters: PostToTopicParamsSchema,
      endpoint: "/write/post-to-topic",
      buildBody: (params) => ({
        topic: params.topic,
        text: params.text,
      }),
      formatSuccess: (response) => {
        if (response.status === "not_configured") {
          return {
            content: [
              {
                type: "text",
                text: "post_to_topic: Telegram not configured on server.",
              },
            ],
          };
        }
        if (response.status === "error") {
          return {
            content: [
              {
                type: "text",
                text: `post_to_topic failed: ${response.error ?? "unknown error"}`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `✅ posted to topic (messageId: ${response.messageId ?? "n/a"})`,
            },
            {
              type: "structured",
              data: {
                status: response.status,
                messageId: response.messageId,
              },
            },
          ],
        };
      },
    },
    opts,
  );
}
