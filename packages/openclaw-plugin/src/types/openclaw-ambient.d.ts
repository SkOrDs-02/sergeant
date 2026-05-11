/**
 * Ambient TypeScript declarations for openclaw 5.7 plugin SDK and TypeBox.
 *
 * Why: the workspace's pnpm-lock.yaml doesn't include `openclaw` or
 * `@sinclair/typebox`, and regenerating the lockfile in Docker is brittle
 * (npm chokes on pnpm's `workspace:*` protocol). For build-time type
 * checking we only need the *shape* of these modules — the actual JS lands
 * at runtime via the synthesised slim package.json in the Docker runtime
 * stage. These declarations describe just enough of each API surface to
 * compile src/index.ts without errors.
 *
 * When openclaw publishes proper types we can `pnpm add` it (locking deps)
 * and delete this file. Until then, this is the pragmatic boundary.
 */

declare module "openclaw/plugin-sdk/plugin-entry" {
  /**
   * Real openclaw 5.7 plugin entry contract — see docs.openclaw.ai/plugin-sdk.
   * The host calls `register(api)` once during plugin load with a runtime
   * API surface that exposes `registerTool`, `on` (for hooks), `config`,
   * etc. We type `api` permissively here because openclaw evolves the
   * surface across patch versions and we don't want compile-time coupling.
   */
  export interface OpenClawPluginApi {
    registerTool: (tool: PluginTool, opts?: { optional?: boolean }) => void;
    on?: (
      eventName: string,
      handler: (event: unknown) => unknown,
      opts?: { priority?: number; timeoutMs?: number },
    ) => void;
    registerHook?: (
      eventName: string | string[],
      handler: (event: unknown) => unknown,
      opts?: { priority?: number; timeoutMs?: number },
    ) => void;
    /** Parsed plugin config (openclaw injects it before `register` runs). */
    config?: unknown;
    pluginConfig?: unknown;
    logger?: {
      debug: (msg: string, fields?: Record<string, unknown>) => void;
      info: (msg: string, fields?: Record<string, unknown>) => void;
      warn: (msg: string, fields?: Record<string, unknown>) => void;
      error: (msg: string, fields?: Record<string, unknown>) => void;
    };
  }

  export interface PluginTool {
    name: string;
    description: string;
    /** TypeBox schema (or JSON Schema literal). */
    parameters: unknown;
    execute: (
      invocationId: string,
      params: Record<string, unknown>,
    ) => Promise<{
      content: Array<{ type: "text"; text: string }>;
    }>;
  }

  export interface PluginDefinition {
    id: string;
    name: string;
    description: string;
    /**
     * Called once at plugin load time. Signature is permissive (variadic
     * rest args) because openclaw 5.x lines have historically passed
     * additional context (e.g. a stringified config) as a second positional
     * arg and we want to introspect what we receive.
     */
    register: (
      api: OpenClawPluginApi,
      ...rest: unknown[]
    ) => void | Promise<void>;
    /** Optional fields openclaw 5.7 also honours but we don't use yet. */
    kind?: string;
    configSchema?: unknown;
    reload?: boolean;
  }

  /** Plugin entry helper — passthrough at runtime; gives us type safety. */
  export function definePluginEntry(def: PluginDefinition): PluginDefinition;
  export default definePluginEntry;
}

declare module "@sinclair/typebox" {
  // Minimal surface — covers what src/index.ts uses. The runtime values come
  // from the actual @sinclair/typebox install in the runtime stage.
  export interface TSchema {
    [key: string]: unknown;
  }

  interface TypeBuilder {
    Object: (
      props: Record<string, TSchema>,
      opts?: Record<string, unknown>,
    ) => TSchema;
    String: (opts?: Record<string, unknown>) => TSchema;
    Number: (opts?: Record<string, unknown>) => TSchema;
    Boolean: (opts?: Record<string, unknown>) => TSchema;
    Array: (items: TSchema, opts?: Record<string, unknown>) => TSchema;
    Record: (key: TSchema, value: TSchema) => TSchema;
    Optional: (schema: TSchema) => TSchema;
    Unknown: () => TSchema;
    Any: () => TSchema;
    Literal: (value: string | number | boolean) => TSchema;
    Union: (schemas: TSchema[]) => TSchema;
  }

  export const Type: TypeBuilder;
}
