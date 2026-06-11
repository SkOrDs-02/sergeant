// Zod-схеми доменних сутностей модуля ФІНІК.
// Використовуються typedStore та валідацією finykStorage.getBudget(), щоб
// ловити биті дані на read-time замість crash'у пізніше по ланцюжку.

import { z } from "zod";

export const BudgetTypeSchema = z.enum(["limit", "goal"]);

// Goal-бюджети не мають ліміту (у формі `limit` лишається "" після spread
// з initial-state у Budgets.jsx), тому `limit` опціональний. Preprocess
// нормалізує "" / null / NaN до undefined — без цього legacy goal-записи
// мовчки відфільтровувалися б у `getBudget()`.
const optionalNumberSchema = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return v;
}, z.number().finite().optional());

export const BudgetSchema = z
  .object({
    id: z.string().min(1),
    type: BudgetTypeSchema.optional(),
    limit: optionalNumberSchema,
    categoryId: z.string().optional(),
    label: z.string().optional(),
    target: optionalNumberSchema,
    current: optionalNumberSchema,
  })
  .passthrough();

export const BudgetsSchema = z.array(BudgetSchema);

export type BudgetParsed = z.infer<typeof BudgetSchema>;

// Тіло `POST /api/v1/finyk/manual-expenses` — ручна (не-Mono) витрата.
//
// Money-інваріант (Hard Rule #1): `amount` приходить у КОПІЙКАХ як `number`
// (minor units, завжди додатнє ціле). На рівні persistence ми конвертуємо у
// гривні, бо канонічна `ManualExpense`-форма у localStorage
// (`finyk_manual_expenses_v1`) історично зберігає `amount` у гривнях — щоб
// downstream client-міграція з `safeWriteLS` читала однаковий blob.
//
// `date` — Europe/Kyiv day boundary (домен-інваріант), формат `YYYY-MM-DD`.
// Якщо не передано — handler підставляє Kyiv-«сьогодні». UTC-«сьогодні»
// мовчки ламає streak/денні агрегації на межі доби.
export const ManualExpenseCreateSchema = z
  .object({
    amount: z.number().int().positive(),
    category: z.string().min(1).max(120),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата має бути у форматі YYYY-MM-DD")
      .optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

export type ManualExpenseCreate = z.infer<typeof ManualExpenseCreateSchema>;

// Відповідь `POST /api/v1/finyk/manual-expenses` (201). Серіалізатор живе в
// `apps/server/src/modules/finyk/manualExpenses.ts#serializeManualExpense`;
// ця схема — канонічний контракт того shape для api-client (Hard Rule #3:
// server serializer ↔ api-client types ↔ contract test рухаються разом).
// Гроші — у КОПІЙКАХ (`amountKopiykas: number`, Hard Rule #1).
export const ManualExpenseSchema = z.object({
  id: z.string().min(1),
  amountKopiykas: z.number().int().positive(),
  category: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ManualExpenseCreateResponseSchema = z.object({
  ok: z.literal(true),
  expense: ManualExpenseSchema,
});

export type ManualExpense = z.infer<typeof ManualExpenseSchema>;
export type ManualExpenseCreateResponse = z.infer<
  typeof ManualExpenseCreateResponseSchema
>;
