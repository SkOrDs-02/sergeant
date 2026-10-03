const MAX_AVATAR_SIZE = 128;
const AVATAR_QUALITY = 0.8;
const MAX_AVATAR_FILE_BYTES = 5 * 1024 * 1024;

export function assertAvatarFile(file: File): void {
  if (!file.type.startsWith("image/")) {
    throw new Error("Обери файл зображення");
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new Error("Зображення завелике. Максимум 5 MB");
  }
}

export function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        MAX_AVATAR_SIZE / img.width,
        MAX_AVATAR_SIZE / img.height,
        1,
      );
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", AVATAR_QUALITY));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не вдалося прочитати зображення"));
    };
    img.src = url;
  });
}
