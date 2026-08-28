/**
 * @status Active
 * @owner @Skords-01
 */
import { useId, useState } from "react";
import { ANALYTICS_EVENTS, type FeedbackCategory } from "@sergeant/shared";
import { feedbackApi } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/Input";
import { Modal } from "@shared/components/ui/Modal";
import { Segmented } from "@shared/components/ui/Segmented";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { trackEvent } from "../observability/analytics";
import { buildPageContext } from "./pageContext";

/**
 * In-app feedback dialog (GTM § 3.2 «Фідбек-лупи») — головний канал
 * багрепортів закритої бети.
 *
 * **Джерело істини для тексту — власний `POST /api/v1/feedback`**, НЕ PostHog.
 * Раніше сабміт був fire-and-forget у PostHog, і тост «дякую» показувався ще
 * до будь-якого підтвердження: у тестера з блокувальником реклами (домен
 * PostHog є в типових блоклистах) або без мережі повідомлення зникало
 * назавжди, а людина була впевнена, що надіслала. Розбір — § 2a у
 * `docs/03-operations/observability/feedback-loop.md`.
 *
 * Тому тут єдиний await у всьому віджеті: «надіслано» кажемо ЛИШЕ після
 * 200 від сервера. Помилка не закриває діалог — текст лишається на екрані,
 * плюс кнопка «скопіювати», щоб праця людини не пропала навіть коли мережа
 * проти нас.
 *
 * `feedback_submitted` у PostHog лишається аналітикою воронки і стріляє
 * ПІСЛЯ успіху — інакше він рахував би спроби, а не доставлені відгуки.
 */

export type { FeedbackCategory };

/** Що показуємо після невдалої спроби. `null` — помилки не було. */
type SubmitError = "offline" | "generic" | null;

const MAX_MESSAGE_LENGTH = 2000;

const PLACEHOLDERS: Record<FeedbackCategory, string> = {
  idea: messages.feedback.placeholderIdea,
  bug: messages.feedback.placeholderBug,
  other: messages.feedback.placeholderOther,
};

export interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const toast = useToast();
  const textareaId = useId();
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [showEmptyError, setShowEmptyError] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Остання лінія оборони: мережа могла впасти, але текст людина вже
    // написала — дати його забрати дешевше, ніж змусити писати вдруге.
    void navigator.clipboard?.writeText(message.trim()).then(
      () => setCopied(true),
      () => {
        /* clipboard заблокований дозволами — кнопка просто не спрацює */
      },
    );
  };

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setShowEmptyError(true);
      return;
    }
    if (sending) return;

    // Page context (URL + viewport) is attached automatically — the
    // manual toggle was removed since feedback only opens from Settings,
    // so asking the user to opt into "this is the settings page" was
    // meaningless. `has_page_context` still reflects what REALLY landed:
    // `buildPageContext()` can return null on a non-DOM edge, and the
    // flag must stay false then so the payload isn't self-contradictory.
    const context = buildPageContext();
    const body = trimmed.slice(0, MAX_MESSAGE_LENGTH);

    setSending(true);
    setSubmitError(null);
    setCopied(false);
    try {
      await feedbackApi.submit({
        category,
        message: body,
        ...(context ? { page: context.page, viewport: context.viewport } : {}),
      });
    } catch {
      // Офлайн відрізняємо від решти не заради краси, а заради поради:
      // «спробуй, коли зʼявиться інтернет» дієва, а на заблокований запит —
      // ні, там треба інший канал.
      setSubmitError(navigator.onLine === false ? "offline" : "generic");
      setSending(false);
      return;
    }
    setSending(false);

    // Аналітика воронки — ПІСЛЯ підтвердженого сабміту. `message` лишається
    // у payload (єдиний навмисний free-text у каталозі подій), але тепер
    // подія означає «відгук доставлено», а не «кнопку натиснуто».
    const payload: Record<string, unknown> = {
      category,
      message: body,
      length: trimmed.length,
      has_page_context: context !== null,
    };
    if (context) {
      payload["page"] = context.page;
      payload["viewport"] = context.viewport;
    }
    trackEvent(ANALYTICS_EVENTS.FEEDBACK_SUBMITTED, payload);

    toast.success(messages.feedback.submitted);
    setMessage("");
    setShowEmptyError(false);
    setSubmitError(null);
    setCategory("idea");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={messages.feedback.dialogTitle}
      description={messages.feedback.dialogDescription}
      size="md"
      footer={
        <Button
          type="button"
          variant="primary"
          className="w-full justify-center"
          loading={sending}
          onClick={() => {
            void handleSubmit();
          }}
        >
          {sending ? messages.feedback.submitting : messages.feedback.submit}
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented<FeedbackCategory>
          ariaLabel={messages.feedback.categoryLabel}
          value={category}
          onChange={setCategory}
          items={[
            { value: "idea", label: messages.feedback.categoryIdea },
            { value: "bug", label: messages.feedback.categoryBug },
            { value: "other", label: messages.feedback.categoryOther },
          ]}
        />
        <Textarea
          id={textareaId}
          label={messages.feedback.messageLabel}
          rows={5}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={PLACEHOLDERS[category]}
          value={message}
          error={showEmptyError}
          {...(showEmptyError
            ? { helperText: messages.feedback.emptyError }
            : {})}
          onChange={(e) => {
            setMessage(e.target.value);
            if (showEmptyError && e.target.value.trim()) {
              setShowEmptyError(false);
            }
            // Текст змінився — стара помилка більше не описує поточний стан.
            if (submitError) setSubmitError(null);
          }}
        />
        {submitError && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/30 bg-danger/10 p-3 space-y-2"
          >
            <p className="text-style-caption text-fg leading-snug">
              {submitError === "offline"
                ? messages.feedback.errorOffline
                : messages.feedback.errorGeneric}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={handleCopy}
            >
              {copied
                ? messages.feedback.copied
                : messages.feedback.copyMessage}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
