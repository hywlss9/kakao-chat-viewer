import { ArrowLeft, CalendarDays, FileText, Image, MessageCircle, Search, Smile, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChatMessage, ChatSession, ParticipantProfile } from "../domain/chatTypes";
import { formatDateLabel, formatTimeLabel, getDateKey } from "../domain/date";
import { clearAllLocalChatData, loadSession } from "../storage/chatSessionStore";
import { AvatarView } from "./AvatarView";

type TimelineItem =
  | { type: "date"; id: string; timestampMs: number }
  | { type: "message"; id: string; message: ChatMessage };

export function ViewerPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session] = useState<ChatSession | null>(() => loadSession(sessionId));
  const parentRef = useRef<HTMLDivElement | null>(null);
  const timeline = useMemo(() => (session ? buildTimeline(session.messages) : []), [session]);
  const dateOptions = useMemo(() => buildDateOptions(timeline), [timeline]);
  const rowVirtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (timeline[index]?.type === "date" ? 42 : 78),
    overscan: 16
  });

  if (!session) {
    return (
      <div className="screen centered-screen">
        <h1>대화방을 찾지 못했습니다</h1>
        <p>같은 탭에서 업로드를 다시 진행해주세요.</p>
        <Link className="primary-button link-button" to="/upload">
          업로드로 이동
        </Link>
      </div>
    );
  }

  const participantMap = new Map(session.participants.map((participant) => [participant.id, participant]));

  return (
    <div className="screen viewer-screen">
      <header className="chat-header">
        <Link aria-label="업로드로 돌아가기" className="icon-button" to="/upload">
          <ArrowLeft size={20} />
        </Link>
        <div className="chat-title">
          <h1>{session.roomName}</h1>
          <span>{session.participants.length}명</span>
        </div>
        <button
          aria-label="로컬 데이터 삭제"
          className="icon-button"
          type="button"
          onClick={() => {
            clearAllLocalChatData();
            navigate("/upload", { replace: true });
          }}
        >
          <Trash2 size={18} />
        </button>
      </header>

      <div className="date-jump">
        <CalendarDays size={16} />
        <select
          aria-label="날짜로 이동"
          onChange={(event) => {
            const index = Number(event.target.value);

            if (Number.isFinite(index)) {
              rowVirtualizer.scrollToIndex(index, { align: "start" });
            }
          }}
        >
          {dateOptions.map((option) => (
            <option key={option.dateKey} value={option.index}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="message-list" ref={parentRef}>
        <div
          className="message-list-inner"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = timeline[virtualRow.index];

            return (
              <div
                className="virtual-row"
                data-index={virtualRow.index}
                key={item.id}
                ref={rowVirtualizer.measureElement}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {item.type === "date" ? (
                  <div className="date-divider">{formatDateLabel(item.timestampMs)}</div>
                ) : (
                  <MessageRow
                    message={item.message}
                    profile={participantMap.get(item.message.participantId)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message, profile }: { message: ChatMessage; profile?: ParticipantProfile }) {
  if (!profile) {
    return null;
  }

  if (message.kind === "system") {
    return <div className="system-message">{message.text}</div>;
  }

  const isMe = profile.isMe;

  return (
    <article className={isMe ? "message-row message-row-me" : "message-row"}>
      {!isMe ? <AvatarView profile={profile} size="sm" /> : null}
      <div className="message-stack">
        {!isMe ? <span className="sender-name">{profile.displayName}</span> : null}
        <div className={isMe ? "bubble bubble-me" : "bubble"}>
          <SpecialMessageContent message={message} />
        </div>
        <time>{formatTimeLabel(message.timestampMs)}</time>
      </div>
    </article>
  );
}

function SpecialMessageContent({ message }: { message: ChatMessage }) {
  if (message.kind === "photo") {
    return (
      <span className="special-content">
        <Image size={16} /> 사진
      </span>
    );
  }

  if (message.kind === "video") {
    return (
      <span className="special-content">
        <MessageCircle size={16} /> 동영상
      </span>
    );
  }

  if (message.kind === "emoticon") {
    return (
      <span className="special-content">
        <Smile size={16} /> 이모티콘
      </span>
    );
  }

  if (message.kind === "file") {
    return (
      <span className="special-content">
        <FileText size={16} /> {message.text.replace(/^파일\s*:\s*/u, "")}
      </span>
    );
  }

  if (message.kind === "shop") {
    return (
      <span className="special-content">
        <Search size={16} /> {message.text.replace(/^샵검색\s*:\s*/u, "")}
      </span>
    );
  }

  return <span>{message.text}</span>;
}

function buildTimeline(messages: ChatMessage[]): TimelineItem[] {
  const timeline: TimelineItem[] = [];
  let lastDateKey = "";

  for (const message of messages) {
    const dateKey = getDateKey(message.timestampMs);

    if (dateKey !== lastDateKey) {
      timeline.push({
        type: "date",
        id: `date-${dateKey}`,
        timestampMs: message.timestampMs
      });
      lastDateKey = dateKey;
    }

    timeline.push({
      type: "message",
      id: message.id,
      message
    });
  }

  return timeline;
}

function buildDateOptions(timeline: TimelineItem[]): Array<{ dateKey: string; label: string; index: number }> {
  return timeline.flatMap((item, index) => {
    if (item.type !== "date") {
      return [];
    }

    return [
      {
        dateKey: getDateKey(item.timestampMs),
        label: formatDateLabel(item.timestampMs),
        index
      }
    ];
  });
}
