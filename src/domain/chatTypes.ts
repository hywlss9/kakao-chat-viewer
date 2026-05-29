export type MessageKind =
  | "text"
  | "photo"
  | "video"
  | "emoticon"
  | "file"
  | "shop"
  | "system";

export type AvatarConfig =
  | { kind: "initialLetter" }
  | { kind: "defaultPreset"; presetId: string }
  | { kind: "uploadedThumbnail"; thumbnailId: string };

export interface ParticipantProfile {
  id: string;
  originalName: string;
  displayName: string;
  avatar: AvatarConfig;
  color: string;
  isMe: boolean;
}

export interface ChatMessage {
  id: string;
  participantId: string;
  kind: MessageKind;
  text: string;
  timestampMs: number;
  sourceIndex: number;
}

export interface ChatSession {
  id: string;
  roomName: string;
  participants: ParticipantProfile[];
  messages: ChatMessage[];
  warnings: string[];
  skippedRows: number;
  createdAt: string;
  sourceFileName: string;
}

export interface ParseResult {
  session: ChatSession;
  warnings: string[];
}

export interface RawChatRow {
  dateText: string;
  user: string;
  message: string;
  sourceIndex: number;
}
