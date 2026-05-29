import type { ChatSession } from "../domain/chatTypes";

const SESSION_PREFIX = "kakao-chat-viewer:session:";
const INDEX_KEY = "kakao-chat-viewer:session-index";
const DB_NAME = "kakao-chat-viewer";
const DB_VERSION = 2;
const AVATAR_STORE = "avatar-thumbnails";
const SESSION_STORE = "chat-sessions";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function saveSession(session: ChatSession): Promise<void> {
  await cleanupExpiredSessions();
  const db = await openDb();
  await requestToPromise(db.transaction(SESSION_STORE, "readwrite").objectStore(SESSION_STORE).put(session, session.id));
  db.close();
}

export async function loadSession(sessionId: string): Promise<ChatSession | null> {
  const raw = sessionStorage.getItem(`${SESSION_PREFIX}${sessionId}`);

  if (raw) {
    try {
      const session = JSON.parse(raw) as ChatSession;

      if (isExpired(session)) {
        await removeSession(sessionId);
        return null;
      }

      await saveSession(session);
      sessionStorage.removeItem(`${SESSION_PREFIX}${sessionId}`);
      return session;
    } catch {
      sessionStorage.removeItem(`${SESSION_PREFIX}${sessionId}`);
    }
  }

  const db = await openDb();
  const session = await requestToPromise<ChatSession | undefined>(
    db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).get(sessionId)
  );
  db.close();

  if (!session) {
    return null;
  }

  if (isExpired(session)) {
    await removeSession(sessionId);
    return null;
  }

  return session;
}

export async function cleanupExpiredSessions(): Promise<void> {
  const db = await openDb();
  const sessions = await requestToPromise<ChatSession[]>(
    db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).getAll()
  );
  const expiredSessionIds = sessions.filter(isExpired).map((session) => session.id);

  if (expiredSessionIds.length > 0) {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    await Promise.all(
      expiredSessionIds.map((sessionId) => requestToPromise(transaction.objectStore(SESSION_STORE).delete(sessionId)))
    );
  }

  db.close();

  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(SESSION_PREFIX) || key === INDEX_KEY) {
      sessionStorage.removeItem(key);
    }
  }
}

export async function clearAllLocalChatData(): Promise<void> {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(SESSION_PREFIX) || key === INDEX_KEY) {
      sessionStorage.removeItem(key);
    }
  }

  await clearObjectStores([SESSION_STORE, AVATAR_STORE]);
}

export async function removeSession(sessionId: string): Promise<void> {
  sessionStorage.removeItem(`${SESSION_PREFIX}${sessionId}`);
  const db = await openDb();
  await requestToPromise(db.transaction(SESSION_STORE, "readwrite").objectStore(SESSION_STORE).delete(sessionId));
  db.close();
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

async function clearObjectStores(storeNames: string[]): Promise<void> {
  const db = await openDb();
  const transaction = db.transaction(storeNames, "readwrite");

  await Promise.all(storeNames.map((storeName) => requestToPromise(transaction.objectStore(storeName).clear())));
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

      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE);
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
