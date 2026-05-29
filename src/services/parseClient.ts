import type { ParseResult } from "../domain/chatTypes";
import { validateChatExportFile } from "../security/fileValidation";

type WorkerResponse =
  | { ok: true; result: ParseResult }
  | { ok: false; error: string };

export function parseFileInWorker(file: File): Promise<ParseResult> {
  validateChatExportFile(file);

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/parse.worker.ts", import.meta.url), { type: "module" });
    const reader = new FileReader();

    reader.onerror = () => {
      worker.terminate();
      reject(new Error("파일을 읽지 못했습니다."));
    };

    reader.onload = () => {
      worker.postMessage({
        fileName: file.name,
        text: String(reader.result ?? "")
      });
    };

    worker.onerror = () => {
      worker.terminate();
      reject(new Error("파싱 워커 실행 중 오류가 발생했습니다."));
    };

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      worker.terminate();

      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };

    reader.readAsText(file, "utf-8");
  });
}
