/**
 * Last validated: 2026-06-03
 * Status: Active
 */
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useResetPinchZoomAfterCameraCapture } from "@shared/hooks/useResetPinchZoomOnResume";
import { useApiForm } from "@shared/forms";
import { mapApiErrorToUserCopy } from "@shared/lib/api/mapApiErrorToUserCopy";
import { cn } from "@shared/lib/ui/cn";
import { meApi } from "@shared/api";
import {
  changeEmail,
  refreshSessionCookieCache,
  sendVerificationEmail,
  updateUser,
} from "../auth/authClient";
import {
  assertAvatarFile,
  avatarUploadErrorCopy,
  compressAvatar,
  resolveAvatarSrc,
} from "./avatar";
import type { ProfileUser } from "./types";

// ── Zod schemas ────────────────────────────────────────────────────────────

const nameSchema = z.object({
  name: z.string().trim().min(1, "Введи імʼя").max(80, "Максимум 80 символів"),
});
type NameValues = z.infer<typeof nameSchema>;

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введи email")
    .email("Некоректний email")
    .max(254, "Email задовгий"),
  // Не обовʼязкове на клієнті: акаунт лише з Google пароля не має, і сервер
  // для нього вимагає свіжий вхід замість пароля (sec-06).
  password: z.string().optional(),
});
type EmailValues = z.infer<typeof emailSchema>;

interface PersonalInfoSectionProps {
  user: ProfileUser;
  online: boolean;
  onRefresh: () => Promise<void>;
}

export function PersonalInfoSection({
  user,
  online,
  onRefresh,
}: PersonalInfoSectionProps) {
  const toast = useToast();
  const armPinchZoomReset = useResetPinchZoomAfterCameraCapture();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [confirmRemoveAvatar, setConfirmRemoveAvatar] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);

  // ── Name form ─────────────────────────────────────────────────────────────
  const nameForm = useApiForm<NameValues>({
    schema: nameSchema,
    defaultValues: { name: user.name ?? "" },
    onSubmit: async (values) => {
      // Помилка форми лишається у формі: `useApiForm` кладе кинуте
      // повідомлення у `serverError`, який рендериться під полем нижче.
      // Паралельний toast.error давав те саме речення двічі — у полі й у
      // куті екрана; сусідня email-форма ніколи так не робила.
      const res = await updateUser({ name: values.name }).catch(() => {
        throw new Error("Не вдалося оновити імʼя");
      });
      if (res.error) {
        throw new Error(
          mapApiErrorToUserCopy(res.error, "Не вдалося оновити імʼя"),
        );
      }
    },
    onSuccess: async () => {
      toast.success("Імʼя оновлено");
      await onRefresh();
    },
  });

  const resetName = nameForm.reset;

  // Keep the form in sync if the server value changes (e.g. after onRefresh).
  useEffect(() => {
    resetName({ name: user.name ?? "" });
  }, [user.name, resetName]);

  // ── Email form ────────────────────────────────────────────────────────────
  const emailForm = useApiForm<EmailValues>({
    schema: emailSchema,
    defaultValues: { email: user.email ?? "", password: "" },
    onSubmit: async (values) => {
      const res = await changeEmail({
        newEmail: values.email,
        ...(values.password ? { password: values.password } : {}),
      });
      if (res.error) {
        throw new Error(
          mapApiErrorToUserCopy(res.error, "Не вдалося змінити email"),
        );
      }
    },
    onSuccess: async () => {
      // Better Auth має дві гілки зміни email, і користувачу треба сказати
      // рівно те, що станеться далі (в обох адреса міняється лише після
      //   кліку в листі, sec-06):
      //   - поточна адреса НЕ підтверджена → лист-верифікація на НОВУ адресу;
      //   - поточна підтверджена → спершу лист-підтвердження на СТАРУ адресу.
      // Обидві гілки віддають `{ status: true }`, тож розрізняємо їх за тим
      // самим прапорцем, який бачив сервер.
      toast.success(
        user.emailVerified
          ? "Лист підтвердження надіслано на поточну адресу"
          : "Лист підтвердження надіслано на нову адресу",
      );
      setEditingEmail(false);
      await onRefresh();
    },
  });

  // ── Non-form actions (avatar, verification) ───────────────────────────────

  /**
   * Завантаження аватара (ux-14). Стиснутий Blob іде СИРИМИ байтами на
   * `PUT /api/avatar`; сервер сам кладе короткий URL у `user.image`.
   * `toast.success` - ЛИШЕ після підтвердженої відповіді (200 зі схемою
   * `AvatarPutResponse`, її парсить api-client): раніше `updateUser` віддавав
   * `{status:true}`, хоч сервер тихо обнуляв `data:` URL, і людина бачила
   * хибне «Аватар оновлено».
   *
   * `file` тримаємо в замиканні, тому «Повторити» у тості жене той самий
   * файл ще раз (тим паче що `fileRef.value` ми вже очистили). Помилки, які
   * повтором не лікуються (413/415/429, непридатний файл), отримують замість
   * цього «Обрати інший».
   */
  const uploadAvatar = async (file: File) => {
    setUploadingAvatar(true);
    try {
      const blob = await compressAvatar(file);
      await meApi.putAvatar(blob);
      toast.success("Аватар оновлено");
      // Сесійний cookie-кеш Better Auth живе до 5 хв і тримав би старий
      // `user.image`: скидаємо його, інакше нове фото зʼявилось би із
      // запізненням. Збережено вже підтверджено - збій оновлення сесії не
      // має перетворювати успіх на хибну помилку.
      await refreshSessionCookieCache();
      await onRefresh().catch(() => {});
    } catch (error) {
      const copy = avatarUploadErrorCopy(error);
      toast.error(
        copy.message,
        undefined,
        copy.retryable
          ? { label: "Повторити", onClick: () => void uploadAvatar(file) }
          : { label: "Обрати інший", onClick: () => fileRef.current?.click() },
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    try {
      assertAvatarFile(file);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Непідтримуваний файл",
        undefined,
        {
          label: "Обрати інший",
          onClick: () => fileRef.current?.click(),
        },
      );
      return;
    }
    await uploadAvatar(file);
  };

  const handleRemoveAvatar = async () => {
    setConfirmRemoveAvatar(false);
    setUploadingAvatar(true);
    try {
      await meApi.deleteAvatar();
      toast.success("Аватар видалено");
      await refreshSessionCookieCache();
      await onRefresh().catch(() => {});
    } catch {
      toast.error("Не вдалося видалити аватар", undefined, {
        label: "Повторити",
        onClick: () => void handleRemoveAvatar(),
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSendVerification = async () => {
    if (!user.email) return;
    setSendingVerification(true);
    try {
      const res = await sendVerificationEmail({ email: user.email });
      if (res.error) {
        toast.error(
          mapApiErrorToUserCopy(
            res.error,
            "Не вдалося надіслати лист підтвердження",
          ),
          undefined,
          { label: "Повторити", onClick: () => void handleSendVerification() },
        );
        return;
      }
      toast.success("Лист підтвердження надіслано");
    } catch {
      toast.error("Не вдалося надіслати лист підтвердження", undefined, {
        label: "Повторити",
        onClick: () => void handleSendVerification(),
      });
    } finally {
      setSendingVerification(false);
    }
  };

  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  return (
    <Card padding="none" className="overflow-hidden">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5 flex flex-col items-center gap-3 border-b border-line/60">
        {/* Avatar */}
        <div className="relative group">
          <button
            type="button"
            disabled={!online || uploadingAvatar}
            onClick={() => fileRef.current?.click()}
            aria-label="Змінити аватар"
            className={cn(
              "relative w-20 h-20 rounded-lg overflow-hidden",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            )}
          >
            {user.image ? (
              <img
                src={resolveAvatarSrc(user.image)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-style-headline w-full h-full flex items-center justify-center bg-panel text-text">
                {initial}
              </div>
            )}
            {/* Hover overlay */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/40",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-fast",
                uploadingAvatar && "opacity-100",
              )}
            >
              {uploadingAvatar ? (
                <span className="motion-safe:animate-spin">
                  <Icon name="refresh-cw" size="lg" className="text-white" />
                </span>
              ) : (
                <Icon name="upload" size={18} className="text-white" />
              )}
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            // Другий вхід у нативну камеру в застосунку — той самий
            // застряглий pinch-zoom на iOS, що й у фото страви.
            onClick={armPinchZoomReset}
            onChange={handleAvatarChange}
          />
        </div>

        {/* Name + email + badges */}
        <div className="text-center min-w-0 w-full">
          <p className="text-style-title text-text truncate">
            {user.name || "Без імені"}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-0.5 flex-wrap">
            <p className="text-style-label text-muted truncate">{user.email}</p>
            {/* Мова H: статус пошти текстом, без чипа й іконки. */}
            <span className="shrink-0 text-style-label text-muted">
              · {user.emailVerified ? "підтверджено" : "не підтверджено"}
            </span>
          </div>

          {/* Avatar remove */}
          {user.image && (
            <div className="mt-2 flex items-center justify-center gap-2">
              {!confirmRemoveAvatar ? (
                <button
                  type="button"
                  className="text-style-label text-muted hover:text-danger transition-colors"
                  disabled={!online || uploadingAvatar}
                  onClick={() => setConfirmRemoveAvatar(true)}
                >
                  Видалити фото
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-style-caption text-danger-strong dark:text-danger">
                    Видалити фото?
                  </span>
                  <button
                    type="button"
                    className="text-style-label font-semibold text-danger-strong dark:text-danger hover:text-danger/80 transition-colors"
                    onClick={handleRemoveAvatar}
                  >
                    Так
                  </button>
                  <button
                    type="button"
                    className="text-style-label text-muted hover:text-text transition-colors"
                    onClick={() => setConfirmRemoveAvatar(false)}
                  >
                    Ні
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Fields ────────────────────────────────────────────────────── */}
      <div className="divide-y divide-line/60">
        {/* Unverified email banner */}
        {!user.emailVerified && user.email && (
          <div className="px-4 py-3 flex items-center gap-3">
            <p className="text-style-label font-semibold text-text flex-1">
              Email не підтверджено, перевір свою поштову скриньку
            </p>
            <Button
              variant="ghost"
              size="xs"
              disabled={!online || sendingVerification}
              loading={sendingVerification}
              onClick={handleSendVerification}
            >
              Надіслати
            </Button>
          </div>
        )}

        {/* Name row */}
        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="profile-name"
            className="text-style-caption block text-muted"
          >
            Імʼя
          </label>
          <div className="flex gap-2">
            <Input
              id="profile-name"
              type="text"
              placeholder="Твоє імʼя"
              autoComplete="name"
              className="flex-1"
              disabled={nameForm.isSubmitting || !online}
              aria-invalid={!!nameForm.formState.errors.name}
              {...nameForm.register("name")}
            />
            <Button
              variant="solid"
              size="sm"
              type="button"
              disabled={
                !nameForm.formState.isDirty || nameForm.isSubmitting || !online
              }
              loading={nameForm.isSubmitting}
              onClick={nameForm.submit}
            >
              Зберегти
            </Button>
          </div>
          {nameForm.formState.errors.name && (
            <p className="text-style-caption text-danger-strong" role="alert">
              {nameForm.formState.errors.name.message}
            </p>
          )}
          {nameForm.serverError && (
            <p className="text-style-caption text-danger-strong" role="alert">
              {nameForm.serverError}
            </p>
          )}
        </div>

        {/* Email row */}
        <div className="px-4 py-4 space-y-2">
          <label
            htmlFor="profile-email"
            className="text-style-caption block text-muted"
          >
            Email
          </label>
          {!editingEmail ? (
            <div className="flex items-center gap-2">
              <p className="text-style-body text-text flex-1 truncate">
                {user.email}
              </p>
              <Button
                variant="ghost"
                size="xs"
                disabled={!online}
                onClick={() => {
                  emailForm.reset({ email: user.email ?? "", password: "" });
                  setEditingEmail(true);
                }}
              >
                Змінити
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  id="profile-email"
                  type="email"
                  placeholder="Новий email"
                  autoComplete="email"
                  className="flex-1"
                  disabled={emailForm.isSubmitting || !online}
                  aria-invalid={!!emailForm.formState.errors.email}
                  {...emailForm.register("email")}
                />
                <Button
                  variant="solid"
                  size="sm"
                  type="button"
                  disabled={
                    emailForm.watch("email")?.trim() === user.email ||
                    emailForm.isSubmitting ||
                    !online
                  }
                  loading={emailForm.isSubmitting}
                  onClick={emailForm.submit}
                >
                  Зберегти
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setEditingEmail(false);
                    emailForm.reset({ email: user.email ?? "", password: "" });
                  }}
                >
                  Скасувати
                </Button>
              </div>
              <Input
                id="profile-email-password"
                type="password"
                placeholder="Поточний пароль"
                aria-label="Поточний пароль"
                autoComplete="current-password"
                disabled={emailForm.isSubmitting || !online}
                {...emailForm.register("password")}
              />
              {emailForm.formState.errors.email && (
                <p
                  className="text-style-caption text-danger-strong"
                  role="alert"
                >
                  {emailForm.formState.errors.email.message}
                </p>
              )}
              {emailForm.serverError && (
                <p
                  className="text-style-caption text-danger-strong"
                  role="alert"
                >
                  {emailForm.serverError}
                </p>
              )}
              {/* AI-NOTE: підказка під полями форми email (sec-06), тож caption-кегль свідомий. */}
              <p className="text-style-caption text-muted">
                Введи поточний пароль. Якщо входиш лише через Google, пароль не
                потрібен, але вхід має бути не давніше 10 хвилин. Адреса
                зміниться після підтвердження з листа.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
