import { safeReadLS } from "@shared/lib/storage/storage";

/**
 * Тексти й прапорці конвеєра надсилання HubChat, винесені з `useChatSend.ts`
 * заради Hard Rule #18 (≤ 600 рядків). Поведінка не змінювалась.
 */
export const CANCELLED_BY_USER_TEXT = "Скасовано, нічого не змінено.";
const AUTO_TTS_ENABLED_KEY = "sergeant:hub-chat:auto-tts:v1";
export const HUB_CHAT_HELP_TEXT = [
  "Команди:",
  "",
  "• /help: показати цю довідку.",
  "• Пиши звичайними словами: «додай витрату 120 грн на каву», «запиши тренування», «що було цього тижня?»",
  "• Кнопка з ? біля поля вводу теж відкриває цю довідку.",
].join("\n");

export function isAutoTtsEnabled(): boolean {
  return safeReadLS<boolean>(AUTO_TTS_ENABLED_KEY) === true;
}
