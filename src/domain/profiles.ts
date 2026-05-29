import type { ParticipantProfile } from "./chatTypes";

export const DEFAULT_PROFILE_COLORS = [
  "#8f9bb3",
  "#5b8def",
  "#35a77a",
  "#d9923b",
  "#b86adf",
  "#e06b6b",
  "#4aa3a2",
  "#6f7f52"
];

export function createParticipantProfile(name: string, index: number): ParticipantProfile {
  return {
    id: stableParticipantId(name),
    originalName: name,
    displayName: name,
    avatar: { kind: "initialLetter" },
    color: DEFAULT_PROFILE_COLORS[index % DEFAULT_PROFILE_COLORS.length],
    isMe: index === 0
  };
}

export function stableParticipantId(name: string): string {
  return `participant-${hashString(name)}`;
}

export function getInitialLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? Array.from(trimmed)[0].toUpperCase() : "?";
}

function hashString(input: string): string {
  let hash = 0;

  for (const char of input) {
    hash = (hash << 5) - hash + char.codePointAt(0)!;
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}
