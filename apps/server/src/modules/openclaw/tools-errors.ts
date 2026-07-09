export class OpenClawAllowlistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawAllowlistError";
  }
}

export class OpenClawSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawSchemaError";
  }
}

/**
 * Throwed коли LLM запитав allowlist-прохідний path/resource, який ще
 * фізично не існує (e.g. `docs/decisions/` до першого decision-PR-у,
 * або subdir, що навмисно не запікається в Docker image). Routes-handler
 * мапає на 404 з `{ error: 'not_found' }` — це user-error, не server-fault,
 * тож НЕ повинен ескалейтись у errorHandler → Sentry-fatal pipeline.
 */
export class OpenClawNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawNotFoundError";
  }
}
