export function parseCsvDateTime(value: string): number | null {
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/u);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

export function toTimestampFromKoreanParts(
  year: number,
  month: number,
  day: number,
  meridiem: string,
  hour: number,
  minute: number
): number {
  const normalizedHour = to24Hour(meridiem, hour);
  return new Date(year, month - 1, day, normalizedHour, minute, 0).getTime();
}

export function formatDateLabel(timestampMs: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(timestampMs);
}

export function formatTimeLabel(timestampMs: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit"
  }).format(timestampMs);
}

export function getDateKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function to24Hour(meridiem: string, hour: number): number {
  if (meridiem === "오전") {
    return hour === 12 ? 0 : hour;
  }

  return hour === 12 ? 12 : hour + 12;
}
