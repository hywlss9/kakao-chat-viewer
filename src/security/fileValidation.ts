export const MAX_CHAT_EXPORT_BYTES = 100 * 1024 * 1024;
export const MAX_AVATAR_IMAGE_BYTES = 5 * 1024 * 1024;

const CHAT_EXPORT_EXTENSIONS = new Set(["csv", "txt"]);
const AVATAR_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function validateChatExportFile(file: File): void {
  const extension = getFileExtension(file.name);

  if (!CHAT_EXPORT_EXTENSIONS.has(extension)) {
    throw new Error("CSV 또는 TXT 형식의 카카오톡 내보내기 파일만 업로드할 수 있습니다.");
  }

  if (file.size > MAX_CHAT_EXPORT_BYTES) {
    throw new Error("대화 파일은 최대 100MB까지 업로드할 수 있습니다.");
  }
}

export function validateAvatarImageFile(file: File): void {
  if (!AVATAR_IMAGE_TYPES.has(file.type)) {
    throw new Error("프로필 사진은 JPG, PNG, WebP, GIF 파일만 사용할 수 있습니다.");
  }

  if (file.size > MAX_AVATAR_IMAGE_BYTES) {
    throw new Error("프로필 사진은 최대 5MB까지 업로드할 수 있습니다.");
  }
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}
