import { useCallback, useState } from "react";
import type * as React from "react";
import {
  useForm,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ApiError } from "@shared/api";

/**
 * Структура `details`, яку віддає `apps/server/src/http/validate.ts`
 * для 400-валідаційних відповідей. Кожен елемент мапиться на одне поле
 * через `setError(detail.path, ...)`. Коли сервер еволюціонує — оновлюй
 * відповідно і `applyServerError` нижче.
 */
export interface ServerFieldError {
  path: string;
  message: string;
}

interface ServerErrorBody {
  error?: string;
  details?: ServerFieldError[];
}

export interface UseApiFormOptions<TValues extends FieldValues, TResponse> {
  /**
   * Zod-схема для валідації — ставиться як `resolver: zodResolver(schema)`.
   * Тип `TValues` має співпадати з `z.infer<typeof schema>`.
   */
  schema: z.ZodType<TValues, TValues>;
  /** Початкові значення; пробросяться у `useForm({ defaultValues })`. */
  defaultValues?: UseFormProps<TValues>["defaultValues"];
  /**
   * Submit-callback. Якщо повертає Promise, який кидає `ApiError` зі
   * структурою `{ details: [{ path, message }] }`, помилки полів будуть
   * автоматично застосовані через `setError`.
   */
  onSubmit: (values: TValues) => Promise<TResponse>;
  /** Викликається тільки при успішному `onSubmit`. */
  onSuccess?: (data: TResponse, values: TValues) => void;
  /** Якщо `true`, форма ресетне значення після успішного submit. */
  resetOnSuccess?: boolean;
  /** Додаткові опції для `useForm` (mode, criteriaMode, тощо). */
  formOptions?: Omit<UseFormProps<TValues>, "resolver" | "defaultValues">;
}

export interface UseApiFormReturn<
  TValues extends FieldValues,
  TResponse = unknown,
> extends UseFormReturn<TValues> {
  /** Pre-bound `handleSubmit(onSubmit)` — для `<form onSubmit>` з шаблону. */
  submit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  /**
   * Чи виконується submit зараз. Об'єднує
   * `formState.isSubmitting` з нашим внутрішнім флагом — нативний RHF
   * `isSubmitting` сам слідкує за promise-ом, але цей флаг гарантовано
   * ставиться навіть якщо handler упав до `setError` (не "pending forever").
   */
  isSubmitting: boolean;
  /**
   * Top-level повідомлення помилки (не прив'язане до конкретного поля).
   * `null`, якщо останній submit пройшов або серверна помилка прив'язана
   * до поля. Для відображення у toast / банері над формою.
   */
  serverError: string | null;
  /** Останній response. `undefined` до першого успішного submit. */
  lastResponse: TResponse | undefined;
  /** Скидання `serverError` (наприклад на blur/focus наступного поля). */
  clearServerError: () => void;
}

/**
 * Перетворює `ApiError` із сервера на `setError(path, …)` виклики.
 *
 * - Якщо `body.details` — масив `{ path, message }`: кожен елемент
 *   ставиться як field-level error через `setError`.
 *   Path "" або відсутній path → top-level error (`serverError`).
 * - Якщо `body.details` нема: `body.error` (або `err.message`) повертається
 *   як top-level error.
 *
 * Returns: top-level error message або null, якщо все привʼязалося до полів.
 */
function applyServerError<TValues extends FieldValues>(
  err: unknown,
  setError: UseFormReturn<TValues>["setError"],
): string | null {
  if (!(err instanceof ApiError)) {
    if (err instanceof Error) return err.message;
    return typeof err === "string" ? err : "Невідома помилка";
  }
  const body = (err.body ?? {}) as ServerErrorBody;
  const details = Array.isArray(body.details) ? body.details : [];

  let topLevel: string | null = null;
  let bound = 0;
  for (const detail of details) {
    if (!detail || typeof detail.message !== "string") continue;
    if (typeof detail.path !== "string" || detail.path === "") {
      topLevel = topLevel ?? detail.message;
      continue;
    }
    setError(detail.path as Path<TValues>, {
      type: "server",
      message: detail.message,
    });
    bound += 1;
  }

  if (bound > 0 && topLevel === null) return null;
  return (
    topLevel ??
    body.error ??
    err.serverMessage ??
    err.message ??
    "Помилка сервера"
  );
}

/**
 * `useApiForm` — стандартний form-engine для всіх форм у `apps/web`.
 *
 * Об'єднує:
 * - **react-hook-form** (стан полів, `register`, `handleSubmit`, `formState`)
 * - **zod** (через `@hookform/resolvers/zod`) для client-side валідації
 * - **server-error mapping** — `ApiError` з `body.details: [{ path, message }]`
 *   автоматично перетворюється на `setError(path, …)`. Top-level `error` →
 *   `serverError`.
 *
 * @example
 * ```tsx
 * const schema = z.object({
 *   email: z.string().email("Некоректний email"),
 *   password: z.string().min(8, "Мінімум 8 символів"),
 * });
 *
 * function LoginForm() {
 *   const { register, submit, formState, isSubmitting, serverError } =
 *     useApiForm({
 *       schema,
 *       defaultValues: { email: "", password: "" },
 *       onSubmit: async (values) => authApi.login(values),
 *       onSuccess: () => navigate("/"),
 *     });
 *
 *   return (
 *     <form onSubmit={submit}>
 *       <Input {...register("email")}
 *         aria-invalid={!!formState.errors.email}
 *         disabled={isSubmitting}
 *       />
 *       {formState.errors.email && <p>{formState.errors.email.message}</p>}
 *
 *       <Input type="password" {...register("password")}
 *         aria-invalid={!!formState.errors.password}
 *         disabled={isSubmitting}
 *       />
 *       {formState.errors.password && <p>{formState.errors.password.message}</p>}
 *
 *       {serverError && <p role="alert">{serverError}</p>}
 *       <Button type="submit" disabled={isSubmitting || !formState.isDirty}>
 *         {isSubmitting ? "Входжу..." : "Увійти"}
 *       </Button>
 *     </form>
 *   );
 * }
 * ```
 *
 * Refs:
 * - docs/audits/2026-05-03-web-deep-dive §3.1 (рекомендація)
 * - apps/server/src/http/validate.ts (server `details` shape)
 * - packages/api-client/src/ApiError.ts (`ApiError.body`)
 */
export function useApiForm<TValues extends FieldValues, TResponse = unknown>({
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
  resetOnSuccess = false,
  formOptions = {},
}: UseApiFormOptions<TValues, TResponse>): UseApiFormReturn<
  TValues,
  TResponse
> {
  const form = useForm<TValues>({
    ...formOptions,
    resolver: zodResolver(schema),
    defaultValues,
  });
  const { handleSubmit, setError, reset } = form;

  const [serverError, setServerError] = useState<string | null>(null);
  const [internalSubmitting, setInternalSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<TResponse | undefined>(
    undefined,
  );

  const clearServerError = useCallback(() => setServerError(null), []);

  const handle: SubmitHandler<TValues> = useCallback(
    async (values: TValues) => {
      setServerError(null);
      setInternalSubmitting(true);
      try {
        const data = await onSubmit(values);
        setLastResponse(data);
        if (resetOnSuccess) reset(undefined, { keepDefaultValues: true });
        onSuccess?.(data, values);
      } catch (err) {
        const top = applyServerError<TValues>(err, setError);
        if (top !== null) setServerError(top);
      } finally {
        setInternalSubmitting(false);
      }
    },
    [onSubmit, onSuccess, reset, resetOnSuccess, setError],
  );

  const submit = useCallback(
    (e?: React.BaseSyntheticEvent) => handleSubmit(handle)(e),
    [handleSubmit, handle],
  );

  return {
    ...form,
    submit,
    isSubmitting: internalSubmitting || form.formState.isSubmitting,
    serverError,
    lastResponse,
    clearServerError,
  };
}
