import type { ChatSession } from "../domain/chatTypes";

const SESSION_PREFIX = "kakao-chat-viewer:session:";
const INDEX_KEY = "kakao-chat-viewer:session-index";
const DB_NAME = "kakao-chat-viewer";
const DB_VERSION = 1;
const AVATAR_STORE = "avatar-thumbnails";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function saveSession(session: ChatSession): void {
  cleanupExpiredSessions();
  sessionStorage.setItem(`${SESSION_PREFIX}${session.id}`, JSON.stringify(session));
  const index = loadSessionIndex();

  if (!index.includes(session.id)) {
    sessionStorage.setItem(INDEX_KEY, JSON.stringify([session.id, ...index]));
  }
}

export function loadSession(sessionId: string): ChatSession | null {
  const raw = sessionStorage.getItem(`${SESSION_PREFIX}${sessionId}`);

  if (!raw) {
    return null;
  }

  try {
    const session = JSON.parse(raw) as ChatSession;

    if (isExpired(session)) {
      removeSession(sessionId);
      return null;
    }

    return session;
  } catch {
    removeSession(sessionId);
    return null;
  }
}

export function loadSessionIndex(): string[] {
  const raw = sessionStorage.getItem(INDEX_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function cleanupExpiredSessions(): void {
  for (const sessionId of loadSessionIndex()) {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${sessionId}`);

    if (!raw) {
      removeSession(sessionId);
      continue;
    }

    try {
      const session = JSON.parse(raw) as ChatSession;

      if (isExpired(session)) {
        removeSession(sessionId);
      }
    } catch {
      removeSession(sessionId);
    }
  }
}

export function clearAllLocalChatData(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(SESSION_PREFIX) || key === INDEX_KEY) {
      sessionStorage.removeItem(key);
    }
  }

  void clearAvatarThumbnails();
}

export function removeSession(sessionId: string): void {
  sessionStorage.removeItem(`${SESSION_PREFIX}${sessionId}`);
  const nextIndex = loadSessionIndex().filter((id) => id !== sessionId);
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(nextIndex));
}

export async function saveAvatarThumbnail(blob: Blob): Promise<string> {
  const id = `avatar-${Date.now().toString(36)}-${crypto.randomUUID()}`;
  const db = await openDb();
  await requestToPromise(db.transaction(AVATAR_STORE, "readwrite").objectStore(AVATAR_STORE).put(blob, id));
  db.close();
  return id;
}

export async function loadAvatarThumbnail(thumbnailId: string): Promise<Blob | null> {
  const db = await openDb();
  const result = await requestToPromise<Blob | undefined>(
    db.transaction(AVATAR_STORE, "readonly").objectStore(AVATAR_STORE).get(thumbnailId)
  );
  db.close();
  return result ?? null;
}

export async function createThumbnailBlob(file: File, size = 160): Promise<Blob> {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const ratio = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(image, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("프로필 이미지를 썸네일로 변환하지 못했습니다."));
        }
      }, "image/jpeg", 0.82);
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function clearAvatarThumbnails(): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(AVATAR_STORE, "readwrite").objectStore(AVATAR_STORE).clear());
  db.close();
}

function isExpired(session: ChatSession): boolean {
  const createdAtMs = Date.parse(session.createdAt);

  if (!Number.isFinite(createdAtMs)) {
    return true;
  }

  return Date.now() - createdAtMs > SESSION_TTL_MS;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("프로필 이미지를 읽지 못했습니다."));
    image.src = src;
  });
}
