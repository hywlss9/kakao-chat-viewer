import { parseChatExport } from "../domain/parser";

self.onmessage = (event: MessageEvent<{ fileName: string; text: string }>) => {
  try {
    const result = parseChatExport(event.data.text, event.data.fileName);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "파일을 해석하지 못했습니다."
    });
  }
};
