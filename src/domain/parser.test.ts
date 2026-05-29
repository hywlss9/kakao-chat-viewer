import { describe, expect, it } from "vitest";
import { parseChatExport } from "./parser";
import { csvFixture, txtBracketFixture, txtCommaFixture } from "../test/fixtures";

describe("parseChatExport", () => {
  it("parses Kakao CSV exports and hides Chat Loss rows", () => {
    const { session } = parseChatExport(csvFixture, "KakaoTalk_Chat_test_2026-05-29-10-39-25.csv");

    expect(session.roomName).toBe("test");
    expect(session.participants.map((participant) => participant.displayName)).toEqual(["박형진", "세욱이형"]);
    expect(session.messages).toHaveLength(6);
    expect(session.skippedRows).toBe(1);
    expect(session.messages.map((message) => message.kind)).toEqual([
      "text",
      "text",
      "file",
      "photo",
      "emoticon",
      "shop"
    ]);
  });

  it("parses bracket-style Kakao TXT exports with multiline messages", () => {
    const { session } = parseChatExport(txtBracketFixture, "chat.txt");

    expect(session.messages).toHaveLength(4);
    expect(session.messages[1].text).toContain("여러 줄 메시지");
    expect(session.messages[2].kind).toBe("file");
    expect(session.messages[3].kind).toBe("photo");
  });

  it("parses comma-style Kakao TXT exports", () => {
    const { session } = parseChatExport(txtCommaFixture, "chat.txt");

    expect(session.messages).toHaveLength(2);
    expect(session.participants).toHaveLength(2);
  });

  it("rejects CSV files without required headers", () => {
    expect(() => parseChatExport("When,Who,What\n1,2,3", "broken.csv")).toThrow(
      "CSV 헤더(Date, User, Message)를 찾지 못했습니다."
    );
  });
});
