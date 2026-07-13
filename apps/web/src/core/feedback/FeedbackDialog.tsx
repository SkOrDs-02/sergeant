/**
 * @status Active
 * @owner @Skords-01
 */
import { useId, useState } from "react";
import { ANALYTICS_EVENTS } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { Textarea } from "@shared/components/ui/Input";
import { Modal } from "@shared/components/ui/Modal";
import { Segmented } from "@shared/components/ui/Segmented";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { trackEvent } from "../observability/analytics";
import { buildPageContext } from "./pageContext";

/**
 * In-app feedback dialog (GTM § 3.2 «Фідбек-лупи» — in-app feedback
 * widget). Категорія + free-text + опціональний контекст сторінки;
 * усе відлітає одним `feedback_submitted` event-ом у PostHog через
 * стандартний `trackEvent`-sink (payload-контракт — у
 * `packages/shared/src/lib/analyticsEvents.ts`).
 *
 * Свідомо без власного бекенда: PostHog — вже підключений транспорт,
 * events читаються у dashboard-інсайті «Feedback inbox» (див.
 * `docs/03-operations/observability/feedback-loop.md`). Сабміт —
 * fire-and-forget: без network-стану, без error-гілки — юзер не має
 * платити очікуванням за нашу телеметрію.
 */

export type FeedbackCategory = "idea" | "bug" | "other";

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

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setShowEmptyError(true);
      return;
    }
    // Page context (URL + viewport) is attached automatically — the
    // manual toggle was removed since feedback only opens from Settings,
    // so asking the user to opt into "this is the settings page" was
    // meaningless. `has_page_context` still reflects what REALLY landed:
    // `buildPageContext()` can return null on a non-DOM edge, and the
    // flag must stay false then so the payload isn't self-contradictory.
    const context = buildPageContext();
    const payload: Record<string, unknown> = {
      category,
      message: trimmed.slice(0, MAX_MESSAGE_LENGTH),
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
          onClick={handleSubmit}
        >
          {messages.feedback.submit}
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
          }}
        />
      </div>
    </Modal>
  );
}
