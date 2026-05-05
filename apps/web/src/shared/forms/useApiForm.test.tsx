// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { z } from "zod";
import { useApiForm } from "./useApiForm";
import { ApiError } from "@shared/api";

/**
 * Тести для `useApiForm` — закривають §3.1 з docs/audits/2026-05-03-web-deep-dive.
 *
 * Покривають:
 * - Happy path (валідні дані → onSubmit)
 * - Client-side zod валідація (помилки на полях)
 * - Server-side `details: [{ path, message }]` mapping (setError per field)
 * - Top-level server error (без `details` → `serverError`)
 * - `isSubmitting` стан під час mutation
 * - `resetOnSuccess` та dirty-state
 * - `clearServerError` ручне скидання
 *
 * Використовуємо `fireEvent` (як решта suite-у) замість `userEvent`,
 * щоб не тягнути новий dev-dep.
 */

const schema = z.object({
  email: z.string().min(1, "Введи email").email("Некоректний формат email"),
  password: z.string().min(8, "Мінімум 8 символів"),
});

type FormValues = z.infer<typeof schema>;

interface TestFormProps {
  onSubmit: (values: FormValues) => Promise<unknown>;
  onSuccess?: (data: unknown) => void;
  resetOnSuccess?: boolean;
}

function TestForm({ onSubmit, onSuccess, resetOnSuccess }: TestFormProps) {
  const {
    register,
    submit,
    formState,
    isSubmitting,
    serverError,
    lastResponse,
    clearServerError,
  } = useApiForm<FormValues>({
    schema,
    defaultValues: { email: "", password: "" },
    onSubmit,
    onSuccess,
    resetOnSuccess,
  });

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        {...register("email")}
        aria-invalid={!!formState.errors.email}
      />
      {formState.errors.email && (
        <p role="alert" data-testid="email-error">
          {formState.errors.email.message}
        </p>
      )}

      <label htmlFor="password">Пароль</label>
      <input
        id="password"
        type="password"
        {...register("password")}
        aria-invalid={!!formState.errors.password}
      />
      {formState.errors.password && (
        <p role="alert" data-testid="password-error">
          {formState.errors.password.message}
        </p>
      )}

      {serverError && (
        <p role="alert" data-testid="server-error">
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !formState.isDirty}
        data-testid="submit"
      >
        {isSubmitting ? "Завантаження…" : "Увійти"}
      </button>
      <button
        type="button"
        onClick={clearServerError}
        data-testid="clear-server-error"
      >
        Скинути серверну помилку
      </button>
      {lastResponse !== undefined && (
        <p data-testid="last-response">{JSON.stringify(lastResponse)}</p>
      )}
    </form>
  );
}

function fillField(label: string, value: string) {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function clickSubmit() {
  fireEvent.click(screen.getByTestId("submit"));
}

describe("useApiForm", () => {
  beforeEach(() => {
    // RHF пише у console.error при `setError` без `name` —
    // глушимо тільки наші очікувані попередження.
  });

  afterEach(() => {
    cleanup();
  });

  it("happy path: валідні дані передаються у onSubmit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, userId: "u1" });
    const onSuccess = vi.fn();
    render(<TestForm onSubmit={onSubmit} onSuccess={onSuccess} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "secret123",
      });
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        { ok: true, userId: "u1" },
        { email: "test@example.com", password: "secret123" },
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId("last-response").textContent).toBe(
        '{"ok":true,"userId":"u1"}',
      );
    });
  });

  it("client-side: zod помилки блокують submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "abc");
    fillField("Пароль", "short");
    clickSubmit();

    expect(await screen.findByTestId("email-error")).toHaveTextContent(
      "Некоректний формат email",
    );
    expect(screen.getByTestId("password-error")).toHaveTextContent(
      "Мінімум 8 символів",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("server: details[].path → setError на правильні поля", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 400,
        message: "Bad Request",
        url: "/api/auth/login",
        body: {
          error: "Некоректні дані запиту",
          details: [
            { path: "email", message: "Email вже зареєстрований" },
            { path: "password", message: "Пароль занадто короткий" },
          ],
        },
      }),
    );

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("email-error")).toHaveTextContent(
      "Email вже зареєстрований",
    );
    expect(screen.getByTestId("password-error")).toHaveTextContent(
      "Пароль занадто короткий",
    );
    expect(screen.queryByTestId("server-error")).not.toBeInTheDocument();
  });

  it("server: 500 без details → top-level serverError", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 500,
        message: "Internal Server Error",
        url: "/api/auth/login",
        body: { error: "Сервер тимчасово недоступний" },
      }),
    );

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("server-error")).toHaveTextContent(
      "Сервер тимчасово недоступний",
    );
    expect(screen.queryByTestId("email-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("password-error")).not.toBeInTheDocument();
  });

  it("server: details із пустим path → top-level serverError", async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new ApiError({
        kind: "http",
        status: 400,
        message: "Bad Request",
        url: "/api/auth/login",
        body: {
          error: "Запит відхилено",
          details: [{ path: "", message: "Загальна помилка авторизації" }],
        },
      }),
    );

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("server-error")).toHaveTextContent(
      "Загальна помилка авторизації",
    );
  });

  it("non-ApiError помилка (мережева): передається як-є", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Network down"));

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("server-error")).toHaveTextContent(
      "Network down",
    );
  });

  it("isSubmitting: кнопка disabled під час pending mutation", async () => {
    let resolveFn: (() => void) | undefined;
    const pending = new Promise<void>((r) => {
      resolveFn = r;
    });
    const onSubmit = vi.fn().mockReturnValue(pending);

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    await waitFor(() => {
      expect(screen.getByTestId("submit")).toHaveTextContent("Завантаження…");
      expect(screen.getByTestId("submit")).toBeDisabled();
    });

    resolveFn!();
    await pending;

    await waitFor(() => {
      expect(screen.getByTestId("submit")).toHaveTextContent("Увійти");
    });
  });

  it("submit disabled поки форма pristine (не dirty)", () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<TestForm onSubmit={onSubmit} />);

    expect(screen.getByTestId("submit")).toBeDisabled();
  });

  it("submit enabled після першої взаємодії (dirty)", async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "a");
    await waitFor(() => {
      expect(screen.getByTestId("submit")).not.toBeDisabled();
    });
  });

  it("resetOnSuccess: значення скидаються після успішного submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(<TestForm onSubmit={onSubmit} resetOnSuccess />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe(
        "",
      );
      expect((screen.getByLabelText("Пароль") as HTMLInputElement).value).toBe(
        "",
      );
    });
  });

  it("clearServerError: top-level error можна скинути вручну", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(
      new ApiError({
        kind: "http",
        status: 500,
        message: "Internal Server Error",
        url: "/api/auth/login",
        body: { error: "Тимчасовий збій" },
      }),
    );

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("server-error")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("clear-server-error"));
    expect(screen.queryByTestId("server-error")).not.toBeInTheDocument();
  });

  it("повторний submit після server-error скидає попередні помилки полів", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError({
          kind: "http",
          status: 400,
          message: "Bad Request",
          url: "/api/auth/login",
          body: {
            error: "Bad",
            details: [{ path: "email", message: "Email вже зареєстрований" }],
          },
        }),
      )
      .mockResolvedValueOnce({ ok: true });

    render(<TestForm onSubmit={onSubmit} />);

    fillField("Email", "test@example.com");
    fillField("Пароль", "secret123");
    clickSubmit();

    expect(await screen.findByTestId("email-error")).toHaveTextContent(
      "Email вже зареєстрований",
    );

    // Друга спроба — успіх. Server-side помилки мають піти.
    fillField("Email", "different@example.com");
    clickSubmit();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByTestId("email-error")).not.toBeInTheDocument();
    });
  });
});
