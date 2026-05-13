import { describe, it, expect } from "vitest";
import type { Request, Response } from "express";
import {
  parseBody,
  parseQuery,
  validateBody,
  validateQuery,
} from "./validate.js";
import { ValidationError } from "../obs/errors.js";
import {
  ChatRequestSchema,
  AnalyzePhotoSchema,
  ParsePantrySchema,
  RecommendRecipesSchema,
  WeeklyDigestSchema,
  CoachInsightSchema,
  z,
} from "./schemas.js";

interface TestRes {
  statusCode: number;
  body: { error?: string; details?: { path: string }[] } | null;
  status(code: number): TestRes;
  json(payload: unknown): TestRes;
}

function mockRes(): TestRes & Response {
  const res: TestRes = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload as TestRes["body"];
      return this;
    },
  };
  return res as TestRes & Response;
}

describe("validateBody", () => {
  it("повертає parsed data для валідного payload-у", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const res = mockRes();
    const result = validateBody(
      schema,
      { body: { a: "x", b: 1 } } as Request,
      res,
    );
    expect(result).toEqual({ ok: true, data: { a: "x", b: 1 } });
    expect(res.statusCode).toBe(200);
  });

  it("повертає 400 з деталями при помилці", () => {
    const schema = z.object({ a: z.string() });
    const res = mockRes();
    const result = validateBody(schema, { body: { a: 42 } } as Request, res);
    expect(result.ok).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body!.error).toBe("Некоректні дані запиту");
    expect(res.body!.details).toHaveLength(1);
    expect(res!.body!.details![0]!.path).toBe("a");
  });

  it("обробляє відсутній body як {}", () => {
    const schema = z.object({ a: z.string().optional() });
    const res = mockRes();
    const result = validateBody(schema, {} as Request, res);
    expect(result.ok).toBe(true);
  });
});

describe("validateQuery", () => {
  it("працює на req.query", () => {
    const schema = z.object({ q: z.string() });
    const res = mockRes();
    const ok = validateQuery(
      schema,
      { query: { q: "foo" } } as unknown as Request,
      res,
    );
    expect(ok).toEqual({ ok: true, data: { q: "foo" } });
  });
});

describe("parseBody (throw-based)", () => {
  it("повертає parsed data для валідного payload-у", () => {
    const schema = z.object({ a: z.string(), b: z.number() });
    const data = parseBody(schema, { body: { a: "x", b: 1 } } as Request);
    expect(data).toEqual({ a: "x", b: 1 });
  });

  it("кидає ValidationError з details у cause при помилці", () => {
    const schema = z.object({ a: z.string() });
    let caught: unknown;
    try {
      parseBody(schema, { body: { a: 42 } } as Request);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    const err = caught as ValidationError;
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toBe("Некоректні дані запиту");
    const cause = err.cause as { details: Array<{ path: string }> };
    expect(cause.details).toHaveLength(1);
    expect(cause.details[0]!.path).toBe("a");
  });

  it("обробляє відсутній body як {}", () => {
    const schema = z.object({ a: z.string().optional() });
    expect(parseBody(schema, {} as Request)).toEqual({});
  });
});

describe("parseQuery (throw-based)", () => {
  it("працює на req.query", () => {
    const schema = z.object({ q: z.string() });
    const data = parseQuery(schema, {
      query: { q: "foo" },
    } as unknown as Request);
    expect(data).toEqual({ q: "foo" });
  });

  it("кидає ValidationError з details у cause при помилці", () => {
    const schema = z.object({ n: z.coerce.number().int() });
    let caught: unknown;
    try {
      parseQuery(schema, {
        query: { n: "not-a-number" },
      } as unknown as Request);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).message).toBe(
      "Некоректні параметри запиту",
    );
  });
});

describe("ChatRequestSchema", () => {
  it("приймає порожній payload з дефолтами", () => {
    const r = ChatRequestSchema.safeParse({});
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.context).toBe("");
    expect(r.data.messages).toEqual([]);
  });

  it("приймає валідний чат", () => {
    const r = ChatRequestSchema.safeParse({
      context: "ctx",
      messages: [
        { role: "user", content: "привіт" },
        { role: "assistant", content: "привіт!" },
      ],
      stream: true,
    });
    expect(r.success).toBe(true);
  });

  it("відкидає занадто довге повідомлення", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "user", content: "x".repeat(9000) }],
    });
    expect(r.success).toBe(false);
  });

  it("відкидає невідому role", () => {
    const r = ChatRequestSchema.safeParse({
      messages: [{ role: "system", content: "hi" }],
    });
    expect(r.success).toBe(false);
  });

  it("обмежує кількість повідомлень", () => {
    const many = Array.from({ length: 60 }, () => ({
      role: "user",
      content: "x",
    }));
    const r = ChatRequestSchema.safeParse({ messages: many });
    expect(r.success).toBe(false);
  });

  it("обмежує розмір context", () => {
    const r = ChatRequestSchema.safeParse({ context: "x".repeat(41_000) });
    expect(r.success).toBe(false);
  });
});

describe("AnalyzePhotoSchema", () => {
  it("вимагає image_base64", () => {
    expect(AnalyzePhotoSchema.safeParse({}).success).toBe(false);
  });

  it("відкидає занадто коротке зображення", () => {
    const r = AnalyzePhotoSchema.safeParse({ image_base64: "short" });
    expect(r.success).toBe(false);
  });

  it("відкидає завелике зображення", () => {
    const r = AnalyzePhotoSchema.safeParse({
      image_base64: "x".repeat(7_100_000),
    });
    expect(r.success).toBe(false);
  });

  it("приймає валідний payload", () => {
    const r = AnalyzePhotoSchema.safeParse({
      image_base64: "x".repeat(200),
      mime_type: "image/jpeg",
      locale: "uk-UA",
    });
    expect(r.success).toBe(true);
  });

  it("відкидає невалідний mime_type", () => {
    const r = AnalyzePhotoSchema.safeParse({
      image_base64: "x".repeat(200),
      mime_type: "text/html",
    });
    expect(r.success).toBe(false);
  });
});

describe("ParsePantrySchema", () => {
  it("trim-ить та вимагає непорожній text", () => {
    expect(ParsePantrySchema.safeParse({ text: "   " }).success).toBe(false);
  });

  it("обмежує довжину text-у", () => {
    const r = ParsePantrySchema.safeParse({ text: "x".repeat(10_100) });
    expect(r.success).toBe(false);
  });

  it("приймає валідний запит", () => {
    const r = ParsePantrySchema.safeParse({
      text: "молоко 1л, хліб",
      locale: "uk-UA",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.text).toBe("молоко 1л, хліб");
  });
});

describe("RecommendRecipesSchema", () => {
  it("приймає порожній запит", () => {
    expect(RecommendRecipesSchema.safeParse({}).success).toBe(true);
  });

  it("обмежує розмір pantry", () => {
    const pantry = Array.from({ length: 300 }, () => ({ name: "x" }));
    const r = RecommendRecipesSchema.safeParse({ pantry });
    expect(r.success).toBe(false);
  });

  it("приймає валідний pantry", () => {
    const r = RecommendRecipesSchema.safeParse({
      pantry: [{ name: "яйце", qty: 5, unit: "шт" }],
      count: 3,
    });
    expect(r.success).toBe(true);
  });
});

describe("WeeklyDigestSchema", () => {
  // На новому пристрої `aggregateFizruk`/`aggregateNutrition`/`aggregateRoutine`
  // повертають null, коли у модулі ще немає даних, — клієнт серіалізує
  // їх як `null` у JSON-теле запиту. Схема має приймати null поряд із
  // undefined, інакше сервер віддає 400 на цілком валідний запит.
  it("приймає null для модулів без даних", () => {
    const r = WeeklyDigestSchema.safeParse({
      weekRange: "14 кві — 20 кві",
      finyk: { totalSpent: 0, totalIncome: 0, txCount: 0, topCategories: [] },
      fizruk: null,
      nutrition: null,
      routine: null,
    });
    expect(r.success).toBe(true);
  });

  it("приймає пропущені поля модулів", () => {
    const r = WeeklyDigestSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("приймає валідний повний payload", () => {
    const r = WeeklyDigestSchema.safeParse({
      weekRange: "14 кві — 20 кві",
      finyk: {
        totalSpent: 1234,
        totalIncome: 500,
        monthlyBudget: 20000,
        txCount: 10,
        topCategories: [{ name: "Їжа", amount: 800 }],
      },
      fizruk: {
        workoutsCount: 3,
        totalVolume: 4000,
        recoveryLabel: "Готовий до тренування",
        topExercises: [{ name: "Присідання", totalVolume: 1500 }],
      },
    });
    expect(r.success).toBe(true);
  });
});

describe("CoachInsightSchema", () => {
  it("приймає null для snapshot і memory (перший сеанс)", () => {
    const r = CoachInsightSchema.safeParse({ snapshot: null, memory: null });
    expect(r.success).toBe(true);
  });

  it("приймає null для внутрішніх модулів snapshot-у", () => {
    const r = CoachInsightSchema.safeParse({
      snapshot: { finyk: null, fizruk: null, nutrition: null, routine: null },
      memory: null,
    });
    expect(r.success).toBe(true);
  });
});
