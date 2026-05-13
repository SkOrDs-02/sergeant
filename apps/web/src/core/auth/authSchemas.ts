import { z } from "zod";
import { messages } from "@shared/i18n/uk";

// Зод-схеми тримаємо поряд з AuthPage, бо вони вузько-локальні (не
// використовуються більше ніде). Окремий пакет `@sergeant/auth-schemas`
// був би оверкіл-ом для двох форм. Меседжі — з `messages.validation.*`
// (`apps/web/src/shared/i18n/uk.ts`), див. AGENTS.md (Hard Rule #15) і
// `docs/i18n/readiness.md`.
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, messages.validation.emailRequired)
    .email(messages.validation.emailInvalid),
  // На login-у ми не нав'язуємо мінімальну довжину пароля — користувач
  // міг створити акаунт у епоху 6-символьного мінімуму, а потім стандарт
  // підняли. Перевірка відбувається на сервері; форма просто гарантує,
  // що поле не порожнє.
  password: z.string().min(1, messages.validation.passwordRequired),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, messages.validation.emailRequired)
    .email(messages.validation.emailInvalid),
  password: z
    .string()
    .min(10, messages.validation.passwordMin10)
    // Better Auth-у достатньо просто довжини, але натякаємо
    // користувачеві, що 10+ символів — нижня межа надійності.
    .max(128, messages.validation.passwordMax128),
  // Імʼя — опціональне; якщо не введене, fallback на `email.split("@")[0]`
  // нижче в `onSubmit`. Залишаємо пустий рядок як валідне значення, щоб
  // RHF не показав помилку «обовʼязкове поле» — це необовʼязкове.
  name: z.string().max(80, messages.validation.nameMax80).optional(),
});
export type RegisterValues = z.infer<typeof registerSchema>;
