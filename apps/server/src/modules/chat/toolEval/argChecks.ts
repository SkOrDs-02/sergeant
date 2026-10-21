/**
 * Перевірка аргументів виклику - другий бік стенду.
 *
 * Імʼя інструмента оцінюється поблажливо (кейс перелічує всі розумні
 * варіанти), аргументи - строго. Причина в ціні помилки: обраний не той
 * інструмент видно одразу, а правильний інструмент із неправильною датою чи
 * сумою тихо пише в базу те, чого користувач не просив.
 *
 * До цього модуля з аргументів звірялись лише вигадані id. Дати, суми,
 * одиниці, обовʼязкові поля й enum не перевірялись ніколи.
 *
 * Два різні джерела істини, і це навмисно:
 *
 * 1. МЕХАНІЧНІ перевірки виводяться зі схеми інструмента і працюють на
 *    кожному виклику без жодного рядка в кейсі. Новий інструмент потрапляє
 *    під них автоматично - той самий принцип інверсії, що в `READ_ONLY`.
 * 2. ОЧІКУВАННЯ пише автор кейса, і лише там, де правильна відповідь
 *    однозначна: «за минулий тиждень» від фіксованої «сьогодні» блоку ДАНІ це
 *    рівно 2026-07-20..2026-07-26, а не предмет смаку. Там, де відповідь
 *    спірна (мапінг категорій), очікування - список прийнятних, а не одне
 *    значення.
 */

import { TOOLS } from "../tools.js";
import type { ToolCase } from "../toolSelectionCases/index.js";
import type { EvalBlock } from "./scoring.js";

export type ArgViolationKind =
  "unknown" | "required" | "type" | "enum" | "date" | "time" | "expected";

export interface ArgViolation {
  tool: string;
  field: string;
  kind: ArgViolationKind;
  detail: string;
}

interface PropertySchema {
  type?: string;
  enum?: unknown[];
  description?: string;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
}

const SCHEMAS = new Map(
  TOOLS.map((t) => {
    const schema = t.input_schema as {
      properties?: Record<string, PropertySchema>;
      required?: string[];
    };
    return [
      t.name,
      {
        properties: schema.properties ?? {},
        required: schema.required ?? [],
      },
    ] as const;
  }),
);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function calendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (days[month - 1] ?? 0)
  );
}

/**
 * Дата чи час розпізнаються за ОПИСОМ поля в схемі, а не за його назвою.
 *
 * Перша версія тримала список імен (`date`, `from`, `to`, `*_date`) і одразу
 * впіймала `convert_units({from:"kg", to:"lb"})` як дві зіпсовані дати. Назва
 * поля нічого не гарантує; формат оголошує саме опис, і його ж читає модель,
 * тож перевірка тепер звіряє те саме джерело, за яким модель і відповідає.
 */
function expectsFormat(prop: PropertySchema, marker: string): boolean {
  return (prop.description ?? "").includes(marker);
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Порушення, які видно зі схеми, без жодного очікування в кейсі.
 *
 * Найцінніше тут - `unknown`: параметр, якого в схемі немає взагалі. Модель
 * вигадує його рівно так само, як вигадує id, але непомітніше: виклик
 * виглядає осмисленим, доїжджає до виконавця й мовчки втрачає намір
 * користувача разом із неіснуючим полем.
 */
export function schemaViolations(blocks: EvalBlock[]): ArgViolation[] {
  const out: ArgViolation[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    if (!block.name?.trim()) {
      out.push({
        tool: "<unnamed>",
        field: "$tool",
        kind: "unknown",
        detail: "tool_use не має непорожнього імені",
      });
      continue;
    }
    const schema = SCHEMAS.get(block.name);
    if (!schema) {
      out.push({
        tool: block.name,
        field: "$tool",
        kind: "unknown",
        detail: "інструмента немає в реєстрі TOOLS",
      });
      continue;
    }
    if (
      block.input === null ||
      typeof block.input !== "object" ||
      Array.isArray(block.input)
    ) {
      out.push({
        tool: block.name,
        field: "$input",
        kind: "type",
        detail: "аргументи мають бути object",
      });
      continue;
    }
    const input = block.input as Record<string, unknown>;

    for (const field of schema.required) {
      if (input[field] == null) {
        out.push({
          tool: block.name,
          field,
          kind: "required",
          detail: "обовʼязкове поле схеми не передано",
        });
      }
    }

    for (const [field, raw] of Object.entries(input)) {
      const prop = Object.hasOwn(schema.properties, field)
        ? schema.properties[field]
        : undefined;
      if (!prop) {
        out.push({
          tool: block.name,
          field,
          kind: "unknown",
          detail: `поля немає в схемі; значення ${JSON.stringify(raw)}`,
        });
        continue;
      }
      out.push(...propertyViolations(block.name, field, raw, prop));
    }
  }
  return out;
}

/** Перевіряє також елементи масиву, а не лише його зовнішній тип. */
function propertyViolations(
  tool: string,
  field: string,
  raw: unknown,
  prop: PropertySchema,
): ArgViolation[] {
  const out: ArgViolation[] = [];
  const actualType = raw === null ? "null" : typeOf(raw);
  if (
    prop.type &&
    (actualType !== prop.type ||
      (prop.type === "number" && !Number.isFinite(raw)))
  ) {
    return [
      {
        tool,
        field,
        kind: "type",
        detail: `схема каже ${prop.type}, приїхало ${actualType} (${JSON.stringify(raw)})`,
      },
    ];
  }
  if (prop.enum && !prop.enum.includes(raw)) {
    out.push({
      tool,
      field,
      kind: "enum",
      detail: `${JSON.stringify(raw)} поза enum [${prop.enum.join(", ")}]`,
    });
  }
  if (
    typeof raw === "string" &&
    expectsFormat(prop, "YYYY-MM-DD") &&
    !calendarDate(raw)
  ) {
    out.push({
      tool,
      field,
      kind: "date",
      detail: `очікується справжня дата YYYY-MM-DD, приїхало ${JSON.stringify(raw)}`,
    });
  }
  if (
    typeof raw === "string" &&
    expectsFormat(prop, "HH:MM") &&
    !HH_MM.test(raw)
  ) {
    out.push({
      tool,
      field,
      kind: "time",
      detail: `очікується час 00:00..23:59, приїхало ${JSON.stringify(raw)}`,
    });
  }
  if (Array.isArray(raw) && prop.items) {
    const items = prop.items;
    raw.forEach((value, index) =>
      out.push(...propertyViolations(tool, `${field}[${index}]`, value, items)),
    );
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    prop.properties
  ) {
    const values = raw as Record<string, unknown>;
    for (const required of prop.required ?? []) {
      if (!Object.hasOwn(values, required) || values[required] == null) {
        out.push({
          tool,
          field: `${field}.${required}`,
          kind: "required",
          detail: "обовʼязкове вкладене поле не передано",
        });
      }
    }
    for (const [key, value] of Object.entries(values)) {
      const nested = Object.hasOwn(prop.properties, key)
        ? prop.properties[key]
        : undefined;
      if (!nested) {
        out.push({
          tool,
          field: `${field}.${key}`,
          kind: "unknown",
          detail: "вкладеного поля немає в схемі",
        });
      } else {
        out.push(...propertyViolations(tool, `${field}.${key}`, value, nested));
      }
    }
  }
  return out;
}

function matches(
  actual: unknown,
  expected: string | number | string[],
): boolean {
  if (Array.isArray(expected)) {
    return expected.some((option) => String(actual) === option);
  }
  if (typeof expected === "number") return Number(actual) === expected;
  return String(actual) === expected;
}

/**
 * Очікування кейса: конкретні значення на конкретному інструменті.
 *
 * Виклик, якого не було, тут мовчить - це вже зараховано як промах вибору, і
 * рахувати ту саму поразку двічі означало б зробити число неспівставним.
 * Перевіряється лише те, що модель таки викликала.
 */
export function expectedArgViolations(
  toolCase: ToolCase,
  blocks: EvalBlock[],
): ArgViolation[] {
  const expectations = toolCase.expectArgs;
  if (!expectations) return [];
  const out: ArgViolation[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_use" || !block.name) continue;
    const wanted = expectations[block.name];
    if (!wanted) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;
    for (const [field, expected] of Object.entries(wanted)) {
      const actual = input[field];
      if (actual == null) {
        out.push({
          tool: block.name,
          field,
          kind: "expected",
          detail: `поле не передано, очікувалось ${JSON.stringify(expected)}`,
        });
        continue;
      }
      if (!matches(actual, expected)) {
        out.push({
          tool: block.name,
          field,
          kind: "expected",
          detail: `${JSON.stringify(actual)} замість ${JSON.stringify(expected)}`,
        });
      }
    }
  }
  return out;
}
