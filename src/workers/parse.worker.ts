import Papa from "papaparse";
import type { ParseResult, RawChatRow } from "../domain/chatTypes";
import { parseChatExport } from "../domain/parser";
import {
  addRawRowToChatSessionBuildState,
  createChatSessionBuildState,
  finalizeChatSessionBuildState
} from "../domain/parser";

type ParseRequest = { file: File; fileName: string };

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  void parseFile(event.data.file, event.data.fileName);
};

async function parseFile(file: File, fileName: string) {
  try {
    const result = fileName.toLowerCase().endsWith(".csv")
      ? await parseCsvFile(file, fileName)
      : parseChatExport(await file.text(), fileName);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "파일을 해석하지 못했습니다."
    });
  }
}

function parseCsvFile(file: File, fileName: string): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const warnings: string[] = [];
    const buildState = createChatSessionBuildState(warnings);
    let headerParsed = false;
    let dateIndex = -1;
    let userIndex = -1;
    let messageIndex = -1;
    let sourceIndex = 0;
    let fatalError: Error | null = null;

    Papa.parse<string[]>(file, {
      chunkSize: 1024 * 1024,
      skipEmptyLines: "greedy",
      chunk: (results, parser) => {
        try {
          for (const row of results.data) {
            sourceIndex += 1;

            if (!headerParsed) {
              if (normalizeHeader(row[0]) !== "Date") {
                continue;
              }

              const header = row.map(normalizeHeader);
              dateIndex = header.indexOf("Date");
              userIndex = header.indexOf("User");
              messageIndex = header.indexOf("Message");

              if (dateIndex === -1 || userIndex === -1 || messageIndex === -1) {
                throw new Error("CSV는 Date, User, Message 컬럼을 포함해야 합니다.");
              }

              headerParsed = true;
              continue;
            }

            const rawRow: RawChatRow = {
              dateText: row[dateIndex]?.trim() ?? "",
              user: row[userIndex]?.trim() ?? "",
              message: row[messageIndex]?.trim() ?? "",
              sourceIndex
            };

            if (!rawRow.dateText && !rawRow.user && !rawRow.message) {
              continue;
            }

            addRawRowToChatSessionBuildState(buildState, rawRow);
          }

          self.postMessage({
            progress: {
              stage: "reading",
              loaded: Math.min(file.size, results.meta.cursor),
              total: file.size,
              percent: Math.min(99, Math.round((results.meta.cursor / file.size) * 100))
            }
          });
        } catch (error) {
          fatalError = error instanceof Error ? error : new Error("CSV 파일을 해석하지 못했습니다.");
          parser.abort();
        }
      },
      complete: () => {
        if (fatalError) {
          reject(fatalError);
          return;
        }

        if (!headerParsed) {
          reject(new Error("CSV 헤더(Date, User, Message)를 찾지 못했습니다."));
          return;
        }

        self.postMessage({ progress: { stage: "parsing" } });
        resolve(finalizeChatSessionBuildState(buildState, fileName));
      },
      error: (error) => reject(new Error(error.message))
    });
  });
}

function normalizeHeader(value = ""): string {
  return value.replace(/^\uFEFF/u, "").trim();
}
