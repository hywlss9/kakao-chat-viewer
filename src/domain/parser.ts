import Papa from "papaparse";
import type { ChatMessage, ChatSession, ParseResult, RawChatRow } from "./chatTypes";
import { parseCsvDateTime, toTimestampFromKoreanParts } from "./date";
import { classifyMessage, shouldHideRow } from "./messageClassifier";
import { createParticipantProfile, stableParticipantId } from "./profiles";

const MAX_RAW_ROWS = 200_000;

export function parseChatExport(text: string, fileName = "chat-export"): ParseResult {
  const warnings: string[] = [];
  const rawRows = looksLikeCsv(text, fileName) ? parseCsvRows(text, warnings) : parseTxtRows(text, warnings);

  if (rawRows.length > MAX_RAW_ROWS) {
    throw new Error("대화가 너무 큽니다. 최대 200,000행까지 지원합니다.");
  }

  const participants = Array.from(new Set(rawRows.map((row) => row.user.trim()).filter(Boolean))).map(
    createParticipantProfile
  );
  const participantIds = new Set(participants.map((participant) => participant.id));
  let skippedRows = 0;

  const messages: ChatMessage[] = rawRows.flatMap((row) => {
    if (shouldHideRow(row.user, row.message)) {
      skippedRows += 1;
      return [];
    }

    const participantId = stableParticipantId(row.user.trim());
    const timestampMs = parseCsvDateTime(row.dateText);

    if (!participantIds.has(participantId)) {
      warnings.push(`${row.sourceIndex}행의 사용자 정보를 해석하지 못했습니다.`);
      skippedRows += 1;
      return [];
    }

    if (timestampMs === null) {
      warnings.push(`${row.sourceIndex}행의 날짜를 해석하지 못했습니다: ${row.dateText}`);
      skippedRows += 1;
      return [];
    }

    return [
      {
        id: `message-${row.sourceIndex}`,
        participantId,
        kind: classifyMessage(row.message),
        text: row.message.trim(),
        timestampMs,
        sourceIndex: row.sourceIndex
      }
    ];
  });

  const session: ChatSession = {
    id: createSessionId(),
    roomName: deriveRoomName(fileName, participants.map((participant) => participant.displayName)),
    participants,
    messages,
    warnings,
    skippedRows,
    createdAt: new Date().toISOString(),
    sourceFileName: fileName
  };

  return { session, warnings };
}

function parseCsvRows(text: string, warnings: string[]): RawChatRow[] {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: "greedy"
  });

  if (parsed.errors.length > 0) {
    warnings.push(...parsed.errors.map((error) => `CSV ${error.row ?? "?"}행: ${error.message}`));
  }

  const rows = parsed.data;
  const headerIndex = rows.findIndex((row) => normalizeHeader(row[0]) === "Date");

  if (headerIndex === -1) {
    throw new Error("CSV 헤더(Date, User, Message)를 찾지 못했습니다.");
  }

  const header = rows[headerIndex].map(normalizeHeader);
  const dateIndex = header.indexOf("Date");
  const userIndex = header.indexOf("User");
  const messageIndex = header.indexOf("Message");

  if (dateIndex === -1 || userIndex === -1 || messageIndex === -1) {
    throw new Error("CSV는 Date, User, Message 컬럼을 포함해야 합니다.");
  }

  return rows.slice(headerIndex + 1).flatMap((row, index) => {
    const sourceIndex = headerIndex + index + 2;
    const dateText = row[dateIndex]?.trim() ?? "";
    const user = row[userIndex]?.trim() ?? "";
    const message = row[messageIndex]?.trim() ?? "";

    if (!dateText && !user && !message) {
      return [];
    }

    return [{ dateText, user, message, sourceIndex }];
  });
}

function parseTxtRows(text: string, warnings: string[]): RawChatRow[] {
  const rows: RawChatRow[] = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let currentDate: { year: number; month: number; day: number } | null = null;

  for (const [lineIndex, line] of lines.entries()) {
    const dateSeparator = line.match(/^-+\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*-+$/u);

    if (dateSeparator) {
      currentDate = {
        year: Number(dateSeparator[1]),
        month: Number(dateSeparator[2]),
        day: Number(dateSeparator[3])
      };
      continue;
    }

    const commaRow = line.match(
      /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.*?)\s*:\s*(.*)$/u
    );

    if (commaRow) {
      const [, year, month, day, meridiem, hour, minute, user, message] = commaRow;
      rows.push({
        dateText: timestampToCsvText(
          toTimestampFromKoreanParts(Number(year), Number(month), Number(day), meridiem, Number(hour), Number(minute))
        ),
        user,
        message,
        sourceIndex: lineIndex + 1
      });
      continue;
    }

    const bracketRow = line.match(/^\[(.+)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*(.*)$/u);

    if (bracketRow && currentDate) {
      const [, user, meridiem, hour, minute, message] = bracketRow;
      rows.push({
        dateText: timestampToCsvText(
          toTimestampFromKoreanParts(
            currentDate.year,
            currentDate.month,
            currentDate.day,
            meridiem,
            Number(hour),
            Number(minute)
          )
        ),
        user,
        message,
        sourceIndex: lineIndex + 1
      });
      continue;
    }

    if (line.trim() && rows.length > 0) {
      rows[rows.length - 1].message += `\n${line}`;
    } else if (line.trim()) {
      warnings.push(`${lineIndex + 1}행을 카카오톡 TXT 메시지로 해석하지 못했습니다.`);
    }
  }

  if (rows.length === 0) {
    throw new Error("TXT 메시지를 찾지 못했습니다.");
  }

  return rows;
}

function looksLikeCsv(text: string, fileName: string): boolean {
  if (fileName.toLowerCase().endsWith(".csv")) {
    return true;
  }

  const firstLine = text.trimStart().split(/\r?\n/u)[0] ?? "";
  return normalizeHeader(firstLine.split(",")[0]) === "Date";
}

function normalizeHeader(value = ""): string {
  return value.replace(/^\uFEFF/u, "").trim();
}

function createSessionId(): string {
  return `session-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

function deriveRoomName(fileName: string, participantNames: string[]): string {
  const match = fileName.match(/KakaoTalk_Chat_(.+?)_\d{4}-\d{2}-\d{2}/u);

  if (match?.[1]) {
    return match[1].replace(/_/g, " ");
  }

  return participantNames.length > 0 ? participantNames.join(", ") : "대화방";
}

function timestampToCsvText(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
