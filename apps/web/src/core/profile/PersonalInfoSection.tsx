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
import { useApiForm } from "@shared/forms";
import { mapApiErrorToUserCopy } from "@shared/lib/api/mapApiErrorToUserCopy";
import { cn } from "@shared/lib/ui/cn";
import {
  changeEmail,
  sendVerificationEmail,
  updateUser,
} from "../auth/authClient";
import { assertAvatarFile, compressAvatar } from "./avatar";
import type { ProfileUser } from "./types";

// ── Zod schemas ────────────────────────────────────────────────────────────

const nameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введіть ім'я")
    .max(80, "Максимум 80 символів"),
});
type NameValues = z.infer<typeof nameSchema>;

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Введіть email")
    .email("Некоректний email")
    .max(254, "Email задовгий"),
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
      const res = await updateUser({ name: values.name }).catch(() => {
        toast.error("Не вдалося оновити ім'я");
        throw new Error("Не вдалося оновити ім'я");
      });
      if (res.error) {
        throw new Error(
          mapApiErrorToUserCopy(res.error, "Не вдалося оновити ім'я"),
        );
      }
    },
    onSuccess: async () => {
      toast.success("Ім'я оновлено");
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
    defaultValues: { email: user.email ?? "" },
    onSubmit: async (values) => {
      const res = await changeEmail({ newEmail: values.email });
      if (res.error) {
        throw new Error(
          mapApiErrorToUserCopy(res.error, "Не вдалося змінити email"),
        );
      }
    },
    onSuccess: async () => {
      toast.success("Лист підтвердження нового email надіслано");
      setEditingEmail(false);
      await onRefresh();
    },
  });

  // ── Non-form actions (avatar, verification) ───────────────────────────────

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setUploadingAvatar(true);
    try {
      assertAvatarFile(file);
      const dataUrl = await compressAvatar(file);
      const res = await updateUser({ image: dataUrl });
      if (res.error) {
        toast.error(
          mapApiErrorToUserCopy(res.error, "Не вдалося оновити аватар"),
        );
        return;
      }
      toast.success("Аватар оновлено");
      await onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не вдалося обробити зображення",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setConfirmRemoveAvatar(false);
    setUploadingAvatar(true);
    try {
      const res = await updateUser({ image: null });
      if (res.error) {
        toast.error(
          mapApiErrorToUserCopy(res.error, "Не вдалося видалити аватар"),
        );
        return;
      }
      toast.success("Аватар видалено");
      await onRefresh();
    } catch {
      toast.error("Не вдалося видалити аватар");
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
        );
        return;
      }
      toast.success("Лист підтвердження надіслано");
    } catch {
      toast.error("Не вдалося надіслати лист підтвердження");
    } finally {
      setSendingVerification(false);
    }
  };

  const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
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
              "relative w-20 h-20 rounded-[22px] overflow-hidden",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
            )}
          >
            {user.image ? (
              <img
                src={user.image}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-style-headline w-full h-full flex items-center justify-center bg-brand-500/15 text-brand-strong dark:text-brand">
                {initial}
              </div>
            )}
            {/* Hover overlay */}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/40",
                "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
                uploadingAvatar && "opacity-100",
              )}
            >
              {uploadingAvatar ? (
                <span className="motion-safe:animate-spin">
                  <Icon name="refresh-cw" size={20} className="text-white" />
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
            {user.emailVerified ? (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xl bg-brand-500/10 text-brand-strong dark:text-brand text-style-caption font-medium">
                <Icon name="check" size={10} strokeWidth={3} />
                Підтверджено
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xl bg-warning/10 text-warning-strong dark:text-warning text-style-caption font-medium">
                <Icon name="alert" size={10} strokeWidth={2.5} />
                Не підтверджено
              </span>
            )}
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
          <div className="px-4 py-3 flex items-center gap-3 bg-warning/5">
            <Icon name="alert" size={15} className="text-warning shrink-0" />
            <p className="text-style-caption text-warning-strong dark:text-warning flex-1">
              Email не підтверджено — перевірте вашу поштову скриньку
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
            Ім&apos;я
          </label>
          <div className="flex gap-2">
            <Input
              id="profile-name"
              type="text"
              placeholder="Твоє ім'я"
              autoComplete="name"
              className="flex-1"
              disabled={nameForm.isSubmitting || !online}
              aria-invalid={!!nameForm.formState.errors.name}
              {...nameForm.register("name")}
            />
            <Button
              variant="primary"
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
                  emailForm.reset({ email: user.email ?? "" });
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
                  variant="primary"
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
                    emailForm.reset({ email: user.email ?? "" });
                  }}
                >
                  Скасувати
                </Button>
              </div>
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
              <p className="text-style-caption text-muted">
                На новий email надійде лист для підтвердження.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
