import { describe, expect, it } from "vitest";
import {
  MAX_AVATAR_IMAGE_BYTES,
  MAX_CHAT_EXPORT_BYTES,
  validateAvatarImageFile,
  validateChatExportFile
} from "./fileValidation";

describe("file validation", () => {
  it("accepts csv and txt chat exports", () => {
    expect(() => validateChatExportFile(new File(["Date,User,Message"], "chat.csv"))).not.toThrow();
    expect(() => validateChatExportFile(new File(["text"], "chat.txt"))).not.toThrow();
  });

  it("rejects unsupported chat export files and oversized files", () => {
    expect(() => validateChatExportFile(new File(["x"], "chat.html"))).toThrow("CSV 또는 TXT");

    const oversizedFile = new File([new Uint8Array(MAX_CHAT_EXPORT_BYTES + 1)], "chat.csv");
    expect(() => validateChatExportFile(oversizedFile)).toThrow("최대 100MB");
  });

  it("accepts safe avatar image types only", () => {
    expect(() => validateAvatarImageFile(new File(["x"], "avatar.png", { type: "image/png" }))).not.toThrow();
    expect(() => validateAvatarImageFile(new File(["x"], "avatar.svg", { type: "image/svg+xml" }))).toThrow(
      "JPG, PNG, WebP, GIF"
    );
  });

  it("rejects oversized avatar images", () => {
    const oversizedFile = new File([new Uint8Array(MAX_AVATAR_IMAGE_BYTES + 1)], "avatar.jpg", {
      type: "image/jpeg"
    });

    expect(() => validateAvatarImageFile(oversizedFile)).toThrow("최대 5MB");
  });
});
