/**
 * Серверний шим на канонічні Zod-схеми з пакета `@sergeant/shared`.
 *
 * Увесь реальний код живе у `packages/shared/src/schemas/api.ts`. Цей файл
 * залишено, щоб існуючі імпорти `import { ... } from "../http/schemas.js"`
 * у серверних модулях продовжували працювати без масового переписування.
 *
 * Для нового коду варто імпортувати напряму:
 *   `import { ChatRequestSchema } from "@sergeant/shared";`
 */
export * from "@sergeant/shared";
