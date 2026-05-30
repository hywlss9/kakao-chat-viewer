import type { ParseResult } from "../domain/chatTypes";
import { validateChatExportFile } from "../security/fileValidation";

export type ParseProgress =
  | { stage: "reading"; loaded: number; total: number; percent: number }
  | { stage: "parsing" };

type WorkerResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string }
  | { progress: ParseProgress };

export function parseFileInWorker(file: File, onProgress?: (progress: ParseProgress) => void): Promise<ParseResult> {
  validateChatExportFile(file);

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/parse.worker.ts", import.meta.url), { type: "module" });

    worker.onerror = () => {
      worker.terminate();
      reject(new Error("파싱 워커 실행 중 오류가 발생했습니다."));
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if ("progress" in event.data) {
        onProgress?.(event.data.progress);
        return;
      }

      worker.terminate();

      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };

    worker.postMessage({ file, fileName: file.name });
  });
}
