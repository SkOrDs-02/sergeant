import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

interface CheckEmailNoticeProps {
  email: string;
  onBack: () => void;
}

/**
 * sec-46 / priv-29: екран після реєстрації, коли сервер сесії не видав.
 * Навмисно однаковий для нової і зайнятої адреси: про наявність акаунта
 * людина дізнається лише з листа у власній скриньці.
 */
export function CheckEmailNotice({ email, onBack }: CheckEmailNoticeProps) {
  return (
    <div role="status" className="space-y-4 text-center">
      <p className="text-style-body text-text">
        {messages.auth.checkEmailSentTo}{" "}
        <strong className="break-all">{email}</strong>.{" "}
        {messages.auth.checkEmailBody}
      </p>
      <p className="text-style-caption text-subtle">
        {messages.auth.checkEmailSpamHint}
      </p>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={onBack}
      >
        {messages.auth.checkEmailBack}
      </Button>
    </div>
  );
}
