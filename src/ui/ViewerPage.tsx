import { ArrowLeft, CalendarDays, FileText, Image, MessageCircle, Search, Smile, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChatMessage, ChatSession, ParticipantProfile } from "../domain/chatTypes";
import { formatDateLabel, formatTimeLabel, getDateKey } from "../domain/date";
import { clearAllLocalChatData, loadSession } from "../storage/chatSessionStore";
import { AvatarView } from "./AvatarView";

type TimelineItem =
  | { type: "date"; id: string; timestampMs: number }
  | { type: "cluster"; id: string; participantId: string; timestampMs: number; messages: ChatMessage[] };

const MAX_ESTIMATED_SCROLL_HEIGHT = 28_000_000;

export function ViewerPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeDateIndex, setActiveDateIndex] = useState<number | null>(null);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const didScrollToLatestRef = useRef(false);
  const activeDateFrameRef = useRef(0);
  const timeline = useMemo(() => (session ? buildTimeline(session.messages) : []), [session]);
  const dateOptions = useMemo(() => buildDateOptions(timeline), [timeline]);
  const estimatedRowSize = useMemo(() => getEstimatedRowSize(timeline.length), [timeline.length]);
  const participantMap = useMemo(
    () => new Map(session?.participants.map((participant) => [participant.id, participant]) ?? []),
    [session]
  );
  const rowVirtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (timeline[index]?.type === "date" ? 42 : estimatedRowSize),
    overscan: 16
  });
  const currentDateOption = getDateOptionForTimelineIndex(
    dateOptions,
    activeDateIndex ?? Math.max(0, timeline.length - 1)
  );

  useEffect(() => {
    let active = true;
    setLoadingSession(true);
    didScrollToLatestRef.current = false;

    loadSession(sessionId).then((nextSession) => {
      if (!active) {
        return;
      }

      setSession(nextSession);
      setLoadingSession(false);
    });

    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (timeline.length === 0 || didScrollToLatestRef.current) {
      return undefined;
    }

    let frameId = 0;
    let attempts = 0;

    const scrollToLatest = () => {
      const scrollElement = parentRef.current;
      rowVirtualizer.scrollToIndex(timeline.length - 1, { align: "end" });

      if (scrollElement) {
          const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);

        if (maxScrollTop > 0 || attempts >= 10) {
          scrollElement.scrollTop = maxScrollTop;
          setActiveDateIndex(getDateOptionForTimelineIndex(dateOptions, timeline.length - 1)?.index ?? timeline.length - 1);
          didScrollToLatestRef.current = true;
          return;
        }
      }

      attempts += 1;
      frameId = window.requestAnimationFrame(scrollToLatest);
    };

    frameId = window.requestAnimationFrame(scrollToLatest);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [dateOptions, rowVirtualizer, timeline.length]);

  function scheduleActiveDateUpdate() {
    if (activeDateFrameRef.current) {
      return;
    }

    activeDateFrameRef.current = window.requestAnimationFrame(() => {
      activeDateFrameRef.current = 0;
      const nextTimelineIndex = getVisibleBottomTimelineIndex(
        rowVirtualizer.getVirtualItems(),
        Math.max(0, timeline.length - 1)
      );
      const nextDateIndex = getDateOptionForTimelineIndex(dateOptions, nextTimelineIndex)?.index ?? nextTimelineIndex;

      setActiveDateIndex((currentDateIndex) => (currentDateIndex === nextDateIndex ? currentDateIndex : nextDateIndex));
    });
  }

  useEffect(() => {
    return () => {
      if (activeDateFrameRef.current) {
        window.cancelAnimationFrame(activeDateFrameRef.current);
      }
    };
  }, []);

  if (loadingSession) {
    return (
      <div className="screen centered-screen">
        <h1>대화방을 불러오는 중입니다</h1>
      </div>
    );
  }

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
            void clearAllLocalChatData();
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
          value={currentDateOption?.index ?? ""}
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

      <div
        className="message-list"
        data-testid="message-list"
        onScroll={scheduleActiveDateUpdate}
        ref={parentRef}
      >
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
                  <MessageCluster
                    messages={item.messages}
                    profile={participantMap.get(item.participantId)}
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

function MessageCluster({
  messages,
  profile
}: {
  messages: ChatMessage[];
  profile?: ParticipantProfile;
}) {
  if (!profile) {
    return null;
  }

  if (messages.length === 1 && messages[0].kind === "system") {
    return <div className="system-message">{messages[0].text}</div>;
  }

  const isMe = profile.isMe;
  const lastMessage = messages[messages.length - 1];

  return (
    <article className={isMe ? "message-row message-row-me" : "message-row"}>
      {!isMe ? <AvatarView profile={profile} size="sm" /> : null}
      <div className="message-stack">
        {!isMe ? (
          <span className="sender-name" data-testid="sender-name">
            {profile.displayName}
          </span>
        ) : null}
        {messages.map((message) => {
          const showTime = message.id === lastMessage.id;

          return (
            <div
              className={isMe ? "message-line message-line-me" : "message-line"}
              key={message.id}
            >
              {isMe && showTime ? (
                <time className="message-time" data-testid="message-time">
                  {formatTimeLabel(message.timestampMs)}
                </time>
              ) : null}
              <div className={isMe ? "bubble bubble-me" : "bubble"}>
                <SpecialMessageContent message={message} />
              </div>
              {!isMe && showTime ? (
                <time className="message-time" data-testid="message-time">
                  {formatTimeLabel(message.timestampMs)}
                </time>
              ) : null}
            </div>
          );
        })}
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
  let currentCluster: Extract<TimelineItem, { type: "cluster" }> | null = null;

  for (const message of messages) {
    const dateKey = getDateKey(message.timestampMs);

    if (dateKey !== lastDateKey) {
      currentCluster = null;
      timeline.push({
        type: "date",
        id: `date-${dateKey}`,
        timestampMs: message.timestampMs
      });
      lastDateKey = dateKey;
    }

    if (currentCluster && isSameMessageCluster(currentCluster.messages[currentCluster.messages.length - 1], message)) {
      currentCluster.messages.push(message);
    } else {
      currentCluster = {
        type: "cluster",
        id: `cluster-${message.id}`,
        participantId: message.participantId,
        timestampMs: message.timestampMs,
        messages: [message]
      };
      timeline.push(currentCluster);
    }
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

function getVisibleBottomTimelineIndex(virtualItems: Array<{ index: number }>, fallbackIndex: number): number {
  return virtualItems[virtualItems.length - 1]?.index ?? fallbackIndex;
}

function getDateOptionForTimelineIndex(
  dateOptions: Array<{ dateKey: string; label: string; index: number }>,
  timelineIndex: number
): { dateKey: string; label: string; index: number } | undefined {
  for (let index = dateOptions.length - 1; index >= 0; index -= 1) {
    const option = dateOptions[index];

    if (option.index <= timelineIndex) {
      return option;
    }
  }

  return dateOptions[0];
}

function isSameMessageCluster(left: ChatMessage | null, right: ChatMessage | null): boolean {
  if (!left || !right) {
    return false;
  }

  if (left.kind === "system" || right.kind === "system") {
    return false;
  }

  return left.participantId === right.participantId && getMinuteKey(left.timestampMs) === getMinuteKey(right.timestampMs);
}

function getMinuteKey(timestampMs: number): number {
  return Math.floor(timestampMs / 60_000);
}

function getEstimatedRowSize(timelineLength: number): number {
  if (timelineLength <= 0) {
    return 78;
  }

  return Math.min(78, Math.max(40, Math.floor(MAX_ESTIMATED_SCROLL_HEIGHT / timelineLength)));
}
