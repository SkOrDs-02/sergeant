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
  items?: { type?: string };
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
const HH_MM = /^\d{2}:\d{2}$/;

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
    if (block.type !== "tool_use" || !block.name) continue;
    const schema = SCHEMAS.get(block.name);
    if (!schema) continue;
    const input = (block.input ?? {}) as Record<string, unknown>;

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
      const prop = schema.properties[field];
      if (!prop) {
        out.push({
          tool: block.name,
          field,
          kind: "unknown",
          detail: `поля немає в схемі; значення ${JSON.stringify(raw)}`,
        });
        continue;
      }
      if (raw == null) continue;

      if (prop.type && typeOf(raw) !== prop.type) {
        out.push({
          tool: block.name,
          field,
          kind: "type",
          detail: `схема каже ${prop.type}, приїхало ${typeOf(raw)} (${JSON.stringify(raw)})`,
        });
        continue;
      }
      if (prop.enum && !prop.enum.includes(raw)) {
        out.push({
          tool: block.name,
          field,
          kind: "enum",
          detail: `${JSON.stringify(raw)} поза enum [${prop.enum.join(", ")}]`,
        });
      }
      if (
        expectsFormat(prop, "YYYY-MM-DD") &&
        typeof raw === "string" &&
        !ISO_DATE.test(raw)
      ) {
        out.push({
          tool: block.name,
          field,
          kind: "date",
          detail: `очікується YYYY-MM-DD, приїхало ${JSON.stringify(raw)}`,
        });
      }
      if (
        expectsFormat(prop, "HH:MM") &&
        typeof raw === "string" &&
        !HH_MM.test(raw)
      ) {
        out.push({
          tool: block.name,
          field,
          kind: "time",
          detail: `очікується HH:MM, приїхало ${JSON.stringify(raw)}`,
        });
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

export function formatViolation(v: ArgViolation): string {
  return `${v.tool}.${v.field} [${v.kind}] ${v.detail}`;
}
