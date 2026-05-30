import { ArrowLeft, CalendarDays, FileText, Image, MessageCircle, Search, Smile, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { UIEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ChatMessage, ChatSession, ParticipantProfile } from "../domain/chatTypes";
import { formatDateLabel, formatTimeLabel, getDateKey } from "../domain/date";
import { clearAllLocalChatData, loadSession } from "../storage/chatSessionStore";
import { AvatarView } from "./AvatarView";

type TimelineItem =
  | { type: "date"; id: string; timestampMs: number }
  | { type: "cluster"; id: string; participantId: string; timestampMs: number; messages: ChatMessage[] };

const VIRTUAL_WINDOW_SIZE = 12_000;
const VIRTUAL_WINDOW_SHIFT_SIZE = 4_000;
const VIRTUAL_WINDOW_EDGE_PX = 900;

export function ViewerPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [activeDateIndex, setActiveDateIndex] = useState<number | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const parentRef = useRef<HTMLDivElement | null>(null);
  const didScrollToLatestRef = useRef(false);
  const activeDateFrameRef = useRef(0);
  const pendingScrollIndexRef = useRef<number | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const shiftingWindowRef = useRef(false);
  const autoScrollingToLatestRef = useRef(false);
  const fullTimeline = useMemo(() => (session ? buildTimeline(session.messages) : []), [session]);
  const visibleTimeline = useMemo(
    () => fullTimeline.slice(windowStart, Math.min(fullTimeline.length, windowStart + VIRTUAL_WINDOW_SIZE)),
    [fullTimeline, windowStart]
  );
  const dateOptions = useMemo(() => buildDateOptions(fullTimeline), [fullTimeline]);
  const participantMap = useMemo(
    () => new Map(session?.participants.map((participant) => [participant.id, participant]) ?? []),
    [session]
  );
  const rowVirtualizer = useVirtualizer({
    count: visibleTimeline.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateTimelineItemHeight(visibleTimeline[index]),
    overscan: 16
  });
  const currentDateOption = getDateOptionForTimelineIndex(
    dateOptions,
    activeDateIndex ?? Math.max(0, fullTimeline.length - 1)
  );

  useEffect(() => {
    let active = true;
    setLoadingSession(true);
    didScrollToLatestRef.current = false;
    autoScrollingToLatestRef.current = false;

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
    if (fullTimeline.length === 0) {
      return;
    }

    const latestIndex = fullTimeline.length - 1;
    setWindowStart(getWindowStartForLatestIndex(latestIndex, fullTimeline.length));
    setActiveDateIndex(latestIndex);
  }, [fullTimeline.length]);

  useEffect(() => {
    const latestWindowStart = getWindowStartForLatestIndex(fullTimeline.length - 1, fullTimeline.length);

    if (visibleTimeline.length === 0 || didScrollToLatestRef.current || windowStart !== latestWindowStart) {
      return undefined;
    }

    let frameId = 0;
    let attempts = 0;

    const scrollToLatest = () => {
      const scrollElement = parentRef.current;
      autoScrollingToLatestRef.current = true;
      rowVirtualizer.scrollToIndex(visibleTimeline.length - 1, { align: "end" });

      if (scrollElement) {
        const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);

        if (maxScrollTop > 0 || attempts >= 10) {
          scrollElement.scrollTop = maxScrollTop;
          setActiveDateIndex(fullTimeline.length - 1);
          didScrollToLatestRef.current = true;
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              autoScrollingToLatestRef.current = false;
            });
          });
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
  }, [fullTimeline.length, rowVirtualizer, visibleTimeline.length, windowStart]);

  useEffect(() => {
    const pendingIndex = pendingScrollIndexRef.current;

    if (pendingIndex === null || visibleTimeline.length === 0) {
      return;
    }

    const localIndex = clamp(pendingIndex - windowStart, 0, visibleTimeline.length - 1);
    rowVirtualizer.scrollToIndex(localIndex, { align: "start" });
    pendingScrollIndexRef.current = null;
  }, [rowVirtualizer, visibleTimeline.length, windowStart]);

  useLayoutEffect(() => {
    const pendingScrollTop = pendingScrollTopRef.current;

    if (pendingScrollTop === null) {
      return;
    }

    pendingScrollTopRef.current = null;

    window.requestAnimationFrame(() => {
      const scrollElement = parentRef.current;

      if (scrollElement) {
        scrollElement.scrollTop = clamp(
          pendingScrollTop,
          0,
          Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight)
        );
      }

      shiftingWindowRef.current = false;
      scheduleActiveDateUpdate();
    });
  }, [windowStart]);

  function handleMessageListScroll(event: UIEvent<HTMLDivElement>) {
    shiftVirtualWindowIfNeeded(event.currentTarget);
    scheduleActiveDateUpdate();
  }

  function shiftVirtualWindowIfNeeded(scrollElement: HTMLDivElement) {
    if (shiftingWindowRef.current || fullTimeline.length <= VIRTUAL_WINDOW_SIZE) {
      return;
    }

    // Keep the browser scroll surface below precision limits for million-row exports.
    const maxWindowStart = Math.max(0, fullTimeline.length - VIRTUAL_WINDOW_SIZE);
    const bottomDistance = scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop;

    if (scrollElement.scrollTop < VIRTUAL_WINDOW_EDGE_PX && windowStart > 0) {
      const nextWindowStart = Math.max(0, windowStart - VIRTUAL_WINDOW_SHIFT_SIZE);
      const addedHeight = estimateTimelineRangeHeight(fullTimeline, nextWindowStart, windowStart);

      shiftingWindowRef.current = true;
      pendingScrollTopRef.current = scrollElement.scrollTop + addedHeight;
      setWindowStart(nextWindowStart);
      return;
    }

    if (bottomDistance < VIRTUAL_WINDOW_EDGE_PX && windowStart < maxWindowStart) {
      const nextWindowStart = Math.min(maxWindowStart, windowStart + VIRTUAL_WINDOW_SHIFT_SIZE);
      const removedHeight = estimateTimelineRangeHeight(fullTimeline, windowStart, nextWindowStart);

      shiftingWindowRef.current = true;
      pendingScrollTopRef.current = scrollElement.scrollTop - removedHeight;
      setWindowStart(nextWindowStart);
    }
  }

  function scheduleActiveDateUpdate() {
    if (activeDateFrameRef.current || autoScrollingToLatestRef.current) {
      return;
    }

    activeDateFrameRef.current = window.requestAnimationFrame(() => {
      activeDateFrameRef.current = 0;

      if (autoScrollingToLatestRef.current) {
        return;
      }

      const scrollElement = parentRef.current;

      if (scrollElement) {
        const maxScrollTop = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);

        if (maxScrollTop > 0 && scrollElement.scrollTop >= maxScrollTop - 2) {
          setActiveDateIndex(fullTimeline.length - 1);
          return;
        }
      }

      const nextTimelineIndex = getVisibleBottomTimelineIndex(
        rowVirtualizer.getVirtualItems(),
        Math.max(0, visibleTimeline.length - 1)
      );
      const nextGlobalIndex = windowStart + nextTimelineIndex;
      const nextDateIndex = getDateOptionForTimelineIndex(dateOptions, nextGlobalIndex)?.index ?? nextGlobalIndex;

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
              pendingScrollIndexRef.current = index;
              setWindowStart(getWindowStartForDateIndex(index, fullTimeline.length));
              setActiveDateIndex(index);
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
        onScroll={handleMessageListScroll}
        ref={parentRef}
      >
        <div
          className="message-list-inner"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = visibleTimeline[virtualRow.index];

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

function getWindowStartForLatestIndex(index: number, timelineLength: number): number {
  return clamp(index - VIRTUAL_WINDOW_SIZE + 1, 0, Math.max(0, timelineLength - VIRTUAL_WINDOW_SIZE));
}

function getWindowStartForDateIndex(index: number, timelineLength: number): number {
  return clamp(index, 0, Math.max(0, timelineLength - VIRTUAL_WINDOW_SIZE));
}

function estimateTimelineRangeHeight(timeline: TimelineItem[], start: number, end: number): number {
  let height = 0;

  for (let index = start; index < end; index += 1) {
    height += estimateTimelineItemHeight(timeline[index]);
  }

  return height;
}

function estimateTimelineItemHeight(item: TimelineItem | undefined): number {
  if (!item) {
    return 78;
  }

  if (item.type === "date") {
    return 42;
  }

  const senderNameHeight = 18;
  const bubbleGaps = Math.max(0, item.messages.length - 1) * 3;
  const bubbleHeight = item.messages.reduce((height, message) => height + estimateBubbleHeight(message), 0);

  return Math.max(52, senderNameHeight + bubbleHeight + bubbleGaps) + 8;
}

function estimateBubbleHeight(message: ChatMessage): number {
  const text = message.text.trim();

  if (message.kind !== "text" || text.length === 0) {
    return 40;
  }

  const lines = text
    .split(/\r?\n/u)
    .reduce((count, line) => count + Math.max(1, Math.ceil(Array.from(line).length / 22)), 0);

  return 18 + lines * 22;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
