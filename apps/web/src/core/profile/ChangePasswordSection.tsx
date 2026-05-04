import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms/useApiForm";
import { changePassword } from "../auth/authClient";

/**
 * Зод-схема — локальна, узгоджена за повідомленнями з `ResetPasswordPage`
 * (Hard Rule #15: меседжі UA). `confirm` валідуємо через `superRefine`,
 * щоб помилка лягла саме на поле підтвердження — стандартний RHF-pattern
 * для cross-field перевірок.
 */
const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Введи поточний пароль"),
    next: z
      .string()
      .min(10, "Мінімум 10 символів")
      .max(128, "Не більше 128 символів"),
    confirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.confirm !== data.next) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirm"],
        message: "Паролі не збігаються",
      });
    }
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export function ChangePasswordSection({ online }: { online: boolean }) {
  const toast = useToast();

  // `useApiForm` зводить валідацію + isSubmitting + server-error mapping
  // в один hook. Better Auth повертає помилку через `result.error` поле,
  // а не через `throw`, тому ми штучно кидаємо `Error(message)`, щоб
  // `useApiForm.serverError` його підхопив (тотожна логіка `ResetPasswordPage`).
  const { register, submit, formState, isSubmitting, serverError, reset } =
    useApiForm<ChangePasswordValues, true>({
      schema: changePasswordSchema,
      defaultValues: { current: "", next: "", confirm: "" },
      onSubmit: async (values) => {
        const res = await changePassword({
          currentPassword: values.current,
          newPassword: values.next,
        });
        if (res?.error) {
          throw new Error(res.error.message ?? "Не вдалося змінити пароль");
        }
        return true as const;
      },
      onSuccess: () => {
        toast.success("Пароль змінено");
        reset({ current: "", next: "", confirm: "" });
      },
    });

  const disabled = !online || isSubmitting;

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center gap-2 border-b border-line">
        <Icon name="lock" size={16} className="text-muted" />
        <span className="text-style-label text-text">Пароль</span>
      </div>

      <form onSubmit={submit} noValidate className="px-4 py-4 space-y-3">
        <div className="space-y-1.5">
          <label
            htmlFor="profile-current-pw"
            className="block text-style-caption text-muted"
          >
            Поточний пароль
          </label>
          <Input
            id="profile-current-pw"
            type="password"
            autoComplete="current-password"
            error={!!formState.errors.current}
            aria-invalid={!!formState.errors.current}
            aria-describedby={
              formState.errors.current ? "profile-current-pw-error" : undefined
            }
            disabled={disabled}
            {...register("current")}
          />
          {formState.errors.current?.message && (
            <p id="profile-current-pw-error" className="text-xs text-danger">
              {formState.errors.current.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="profile-new-pw"
            className="block text-style-caption text-muted"
          >
            Новий пароль
          </label>
          <Input
            id="profile-new-pw"
            type="password"
            minLength={10}
            autoComplete="new-password"
            error={!!formState.errors.next}
            aria-invalid={!!formState.errors.next}
            aria-describedby={
              formState.errors.next ? "profile-new-pw-error" : undefined
            }
            disabled={disabled}
            {...register("next")}
          />
          {formState.errors.next?.message && (
            <p id="profile-new-pw-error" className="text-xs text-danger">
              {formState.errors.next.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="profile-confirm-pw"
            className="block text-style-caption text-muted"
          >
            Підтвердити пароль
          </label>
          <Input
            id="profile-confirm-pw"
            type="password"
            autoComplete="new-password"
            error={!!formState.errors.confirm}
            aria-invalid={!!formState.errors.confirm}
            aria-describedby={
              formState.errors.confirm ? "profile-confirm-pw-error" : undefined
            }
            disabled={disabled}
            {...register("confirm")}
          />
          {formState.errors.confirm?.message && (
            <p id="profile-confirm-pw-error" className="text-xs text-danger">
              {formState.errors.confirm.message}
            </p>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="text-xs text-error bg-error/10 border border-error/20 rounded-xl px-3 py-2"
          >
            {serverError}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          className="w-full mt-1"
          disabled={disabled}
          loading={isSubmitting}
        >
          Змінити пароль
        </Button>
      </form>
    </Card>
  );
}
