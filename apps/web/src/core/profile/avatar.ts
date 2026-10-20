/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Аватар профілю (ux-14). Клієнт стискає зображення до невеликого Blob і шле
 * його СИРИМИ байтами на `PUT /api/avatar` (байти живуть у Postgres, див.
 * `apps/server/src/modules/avatar`). `data:` URL у `user.image` більше не
 * їде: сервер його навмисно обнуляє (`sanitizeUserImage`).
 */
import { isApiError } from "@sergeant/api-client";
import { AVATAR_MAX_BYTES } from "@sergeant/shared";
import { apiUrl } from "@shared/lib/api/apiUrl";

const AVATAR_QUALITY = 0.8;
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;
/**
 * Спроби стиснення від найякіснішої: 128px/0.8 → менше й гірше, доки не
 * влізе в `AVATAR_MAX_BYTES`. Типовий результат (128px webp) - 3-10 КБ, тож
 * далі першої спроби доходить лише нетипова графіка (дрібний шум, PNG-фолбек).
 */
const ATTEMPTS: ReadonlyArray<{ size: number; quality: number }> = [
  { size: 128, quality: AVATAR_QUALITY },
  { size: 128, quality: 0.6 },
  { size: 96, quality: 0.6 },
  { size: 64, quality: 0.5 },
];

export function assertAvatarFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("Обери файл зображення");
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new Error("Зображення завелике. Максимум 5 MB");
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Стискає файл до Blob (`image/webp`, а якщо браузер не вміє кодувати webp і
 * повернув png - то `image/png`), що влізає в `AVATAR_MAX_BYTES`.
 */
export function compressAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      void (async () => {
        try {
          for (const { size, quality } of ATTEMPTS) {
            const canvas = document.createElement("canvas");
            const scale = Math.min(size / img.width, size / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Canvas context unavailable"));
              return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const blob = await canvasToBlob(canvas, "image/webp", quality);
            if (!blob) {
              reject(new Error("Не вдалося обробити зображення"));
              return;
            }
            if (blob.size <= AVATAR_MAX_BYTES) {
              resolve(blob);
              return;
            }
          }
          reject(new Error("Зображення надто деталізоване. Обери інше фото"));
        } catch {
          reject(new Error("Не вдалося обробити зображення"));
        }
      })();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не вдалося прочитати зображення"));
    };
    img.src = url;
  });
}

/**
 * `user.image` може бути зовнішнім https-URL (OAuth) або нашим коротким
 * відносним шляхом `/api/avatar/<id>?v=…`. Веб і API живуть на різних
 * origin-ах, тож відносний шлях треба привʼязати до API (`apiUrl` ще й
 * додає версію `/api/v1`). Усе інше повертаємо як є.
 */
export function resolveAvatarSrc(image: string): string {
  return image.startsWith("/api/") ? apiUrl(image) : image;
}

export interface AvatarErrorCopy {
  message: string;
  /** Чи має сенс «Повторити» з тим самим файлом (мережа, 5xx), а не «Обрати інший». */
  retryable: boolean;
}

/**
 * Чесна UA-копія помилки завантаження аватара (tone: спокійно + що робити
 * далі, `docs/product/copy/style-guide.uk.md` §5). Ніколи не віддає сирий
 * серверний текст.
 */
export function avatarUploadErrorCopy(error: unknown): AvatarErrorCopy {
  if (isApiError(error)) {
    if (error.kind === "network") {
      return {
        message: "Немає зʼєднання. Перевір інтернет і спробуй ще раз.",
        retryable: true,
      };
    }
    switch (error.status) {
      case 413:
        return {
          message: "Фото завелике. Обери інше, менше за розміром.",
          retryable: false,
        };
      case 415:
        return {
          message: "Цей формат не підходить. Обери JPEG, PNG або WebP.",
          retryable: false,
        };
      case 429:
        return {
          message: "Забагато спроб. Спробуй трохи пізніше.",
          retryable: false,
        };
      case 401:
      case 403:
        return {
          message: "Сесія завершилась. Увійди ще раз.",
          retryable: false,
        };
      default:
        return {
          message: "Не вдалося зберегти аватар. Спробуй ще раз.",
          retryable: true,
        };
    }
  }
  // Власні помилки стиснення вже українською; англійські технічні тексти
  // (`Canvas context unavailable`) людині не показуємо.
  if (error instanceof Error && /[а-яіїєґ]/i.test(error.message)) {
    return { message: error.message, retryable: false };
  }
  return {
    message: "Не вдалося зберегти аватар. Спробуй ще раз.",
    retryable: true,
  };
}
