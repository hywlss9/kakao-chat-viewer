import { Check, FileUp, ImagePlus, Loader2, Trash2, UserRoundCheck } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ChatSession, ParticipantProfile } from "../domain/chatTypes";
import { DEFAULT_PROFILE_COLORS } from "../domain/profiles";
import { validateAvatarImageFile } from "../security/fileValidation";
import { parseFileInWorker, type ParseProgress } from "../services/parseClient";
import {
  clearAllLocalChatData,
  createThumbnailBlob,
  saveAvatarThumbnail,
  saveSession
} from "../storage/chatSessionStore";
import { AvatarView } from "./AvatarView";

const participantNameCollator = new Intl.Collator("ko-KR", { numeric: true, sensitivity: "base" });

export function UploadPage() {
  const navigate = useNavigate();
  const [draftSession, setDraftSession] = useState<ChatSession | null>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "ready" | "saving" | "clearing">("idle");
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [activeFileName, setActiveFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canComplete = useMemo(() => {
    if (!draftSession) {
      return false;
    }

    const hasMe = draftSession.participants.filter((participant) => participant.isMe).length === 1;
    return hasMe && draftSession.participants.every((participant) => participant.displayName.trim().length > 0);
  }, [draftSession]);
  const sortedParticipants = useMemo(
    () => [...(draftSession?.participants ?? [])].sort(compareParticipantsByDisplayName),
    [draftSession?.participants]
  );

  async function handleFile(file: File) {
    setError(null);
    setActiveFileName(file.name);
    setParseProgress(null);
    setStatus("parsing");

    try {
      const result = await parseFileInWorker(file, setParseProgress);
      setDraftSession(result.session);
      setParseProgress(null);
      setStatus("ready");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "파일을 해석하지 못했습니다.");
      setParseProgress(null);
      setStatus("idle");
    }
  }

  function updateParticipant(participantId: string, update: Partial<ParticipantProfile>) {
    setDraftSession((session) => {
      if (!session) {
        return session;
      }

      return {
        ...session,
        participants: session.participants.map((participant) =>
          participant.id === participantId ? { ...participant, ...update } : participant
        )
      };
    });
  }

  function selectMe(participantId: string) {
    setDraftSession((session) => {
      if (!session) {
        return session;
      }

      return {
        ...session,
        participants: session.participants.map((participant) => ({
          ...participant,
          isMe: participant.id === participantId
        }))
      };
    });
  }

  async function uploadAvatar(participantId: string, file: File) {
    setError(null);

    try {
      validateAvatarImageFile(file);
      const thumbnail = await createThumbnailBlob(file);
      const thumbnailId = await saveAvatarThumbnail(thumbnail);
      updateParticipant(participantId, { avatar: { kind: "uploadedThumbnail", thumbnailId } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "프로필 사진을 처리하지 못했습니다.");
    }
  }

  async function clearLocalData() {
    if (status === "clearing") {
      return;
    }

    const statusOnError = draftSession ? "ready" : "idle";

    setError(null);
    setStatus("clearing");

    try {
      await clearAllLocalChatData();
      setDraftSession(null);
      setActiveFileName("");
      setParseProgress(null);
      setStatus("idle");
    } catch {
      setError("로컬 데이터를 삭제하지 못했습니다. 브라우저 저장소 권한을 확인한 뒤 다시 시도해주세요.");
      setStatus(statusOnError);
    }
  }

  async function completeSetup() {
    if (!draftSession || !canComplete) {
      return;
    }

    setStatus("saving");

    try {
      await saveSession(draftSession);
      navigate(`/viewer/${draftSession.id}`);
    } catch {
      setError("대화 내용을 브라우저 저장소에 저장하지 못했습니다. 파일 크기를 줄인 뒤 다시 시도해주세요.");
      setStatus("ready");
    }
  }

  return (
    <div className="screen upload-screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Kakao export viewer</p>
          <h1>대화 파일 업로드</h1>
        </div>
      </header>

      {!draftSession ? (
        <section className="upload-panel">
          {status === "parsing" ? (
            <LoadingPanel fileName={activeFileName} progress={parseProgress} />
          ) : status === "clearing" ? (
            <ClearingPanel />
          ) : (
            <>
              <FileUp aria-hidden="true" size={40} />
              <h2>TXT 또는 CSV 파일을 선택하세요</h2>
              <p>파일은 서버로 전송되지 않고 이 브라우저 안에서만 해석됩니다. 임시 데이터는 12시간 뒤 만료됩니다.</p>
            </>
          )}
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            aria-label="대화 파일 선택"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void handleFile(file);
              }
            }}
          />
          <button
            className="primary-button"
            type="button"
            disabled={status === "parsing" || status === "clearing"}
            onClick={() => fileInputRef.current?.click()}
          >
            {status === "parsing" ? <Loader2 className="spin" size={18} /> : <FileUp size={18} />}
            {status === "parsing" ? "해석 중" : "파일 선택"}
          </button>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="ghost-button" type="button" disabled={status === "clearing"} onClick={() => void clearLocalData()}>
            {status === "clearing" ? <Loader2 className="spin" size={16} /> : <Trash2 size={16} />}
            {status === "clearing" ? "삭제 중" : "로컬 데이터 삭제"}
          </button>
        </section>
      ) : (
        <section className="profile-setup" aria-label="프로필 설정">
          <div className="setup-summary">
            <div>
              <p className="eyebrow">{draftSession.sourceFileName}</p>
              <h2>{draftSession.roomName}</h2>
            </div>
            <span>{draftSession.messages.length.toLocaleString()}개 메시지</span>
          </div>

          {draftSession.warnings.length > 0 || draftSession.skippedRows > 0 ? (
            <div className="notice">
              숨김 처리 {draftSession.skippedRows.toLocaleString()}건
              {draftSession.warnings.length > 0 ? `, 경고 ${draftSession.warnings.length.toLocaleString()}건` : ""}
            </div>
          ) : null}

          <div className="participant-list">
            {sortedParticipants.map((participant) => (
              <article className="participant-row" key={participant.id}>
                <AvatarView profile={participant} size="lg" />
                <div className="participant-fields">
                  <label>
                    <span>이름</span>
                    <input
                      value={participant.displayName}
                      onChange={(event) => updateParticipant(participant.id, { displayName: event.target.value })}
                    />
                  </label>
                  <div className="profile-actions">
                    <button
                      className={participant.isMe ? "chip chip-selected" : "chip"}
                      type="button"
                      onClick={() => selectMe(participant.id)}
                    >
                      <UserRoundCheck size={15} /> 나
                    </button>
                    <label className="chip file-chip">
                      <ImagePlus size={15} />
                      사진
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          if (file) {
                            void uploadAvatar(participant.id, file);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="color-swatches" aria-label={`${participant.displayName} 기본 프로필 색상`}>
                    {DEFAULT_PROFILE_COLORS.map((color, index) => (
                      <button
                        aria-label={`기본 프로필 색상 ${index + 1}`}
                        className={participant.color === color ? "swatch swatch-selected" : "swatch"}
                        key={color}
                        style={{ backgroundColor: color }}
                        type="button"
                        onClick={() =>
                          updateParticipant(participant.id, {
                            avatar: { kind: "defaultPreset", presetId: `preset-${index + 1}` },
                            color
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <footer className="bottom-action">
            {error ? <p className="bottom-error">{error}</p> : null}
            {status === "saving" ? <SavingPanel /> : null}
            {status === "clearing" ? <ClearingPanel compact /> : null}
            <button
              className="primary-button"
              type="button"
              disabled={!canComplete || status === "saving" || status === "clearing"}
              onClick={() => void completeSetup()}
            >
              {status === "saving" ? <Loader2 className="spin" size={18} /> : <Check size={18} />}
              {status === "saving" ? "저장 중" : "완료"}
            </button>
            <button className="ghost-button compact" type="button" disabled={status === "clearing"} onClick={() => void clearLocalData()}>
              {status === "clearing" ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
              {status === "clearing" ? "삭제 중" : "로컬 데이터 삭제"}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}

function compareParticipantsByDisplayName(left: ParticipantProfile, right: ParticipantProfile): number {
  return participantNameCollator.compare(
    left.displayName.trim() || left.originalName,
    right.displayName.trim() || right.originalName
  );
}

function LoadingPanel({ fileName, progress }: { fileName: string; progress: ParseProgress | null }) {
  const isReading = progress?.stage === "reading";
  const percent = isReading ? progress.percent : null;

  return (
    <div className="loading-panel" aria-live="polite" role="status">
      <Loader2 className="spin" size={42} />
      <h2>{isReading ? "파일을 읽는 중입니다" : "대화 내용을 분석 중입니다"}</h2>
      <p>{fileName ? `${fileName} 파일을 브라우저 안에서 처리하고 있습니다.` : "잠시만 기다려주세요."}</p>
      <div className="progress-track" aria-label="파일 처리 진행률">
        <span className="progress-bar" style={{ width: `${percent ?? 100}%` }} />
      </div>
      <span className="progress-label">
        {isReading ? `${percent}% · ${formatBytes(progress.loaded)} / ${formatBytes(progress.total)}` : "대화 형식을 정리하고 있습니다"}
      </span>
    </div>
  );
}

function ClearingPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "saving-panel" : "loading-panel"} aria-live="polite" role="status">
      <Loader2 className="spin" size={compact ? 16 : 42} />
      {compact ? (
        "로컬 데이터를 삭제하는 중입니다."
      ) : (
        <>
          <h2>로컬 데이터를 삭제하는 중입니다</h2>
          <p>브라우저에 저장된 대화와 프로필 썸네일을 정리하고 있습니다.</p>
        </>
      )}
    </div>
  );
}

function SavingPanel() {
  return (
    <div className="saving-panel" aria-live="polite" role="status">
      <Loader2 className="spin" size={16} />
      대화 내용을 현재 브라우저에 저장하는 중입니다.
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }

  return `${bytes}B`;
}
