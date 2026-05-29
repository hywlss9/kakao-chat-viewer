import type { MessageKind } from "./chatTypes";

const PHOTO_MESSAGES = new Set(["사진"]);
const VIDEO_MESSAGES = new Set(["동영상"]);
const EMOTICON_MESSAGES = new Set(["이모티콘"]);

export function classifyMessage(message: string): MessageKind {
  const trimmed = message.trim();

  if (PHOTO_MESSAGES.has(trimmed)) {
    return "photo";
  }

  if (VIDEO_MESSAGES.has(trimmed)) {
    return "video";
  }

  if (EMOTICON_MESSAGES.has(trimmed)) {
    return "emoticon";
  }

  if (/^파일\s*:/u.test(trimmed)) {
    return "file";
  }

  if (/^샵검색\s*:/u.test(trimmed) || /^#[^\s#]/u.test(trimmed)) {
    return "shop";
  }

  if (/님이\s.+(들어왔습니다|나갔습니다|초대했습니다|보냈습니다)\.?$/u.test(trimmed)) {
    return "system";
  }

  return "text";
}

export function shouldHideRow(user: string, message: string): boolean {
  const normalizedMessage = message.trim();

  return user.trim().length === 0 || normalizedMessage === "" || normalizedMessage === "Chat Loss";
}
