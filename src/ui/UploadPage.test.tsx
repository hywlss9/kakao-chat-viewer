import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseChatExport } from "../domain/parser";
import type { ParseResult } from "../domain/chatTypes";
import { csvFixture } from "../test/fixtures";
import { UploadPage } from "./UploadPage";
import { parseFileInWorker } from "../services/parseClient";
import { clearAllLocalChatData } from "../storage/chatSessionStore";

vi.mock("../services/parseClient", () => ({
  parseFileInWorker: vi.fn(async () => parseChatExport(csvFixture, "fixture.csv"))
}));

vi.mock("../storage/chatSessionStore", async () => {
  const actual = await vi.importActual<typeof import("../storage/chatSessionStore")>("../storage/chatSessionStore");
  return {
    ...actual,
    clearAllLocalChatData: vi.fn(),
    saveSession: vi.fn()
  };
});

describe("UploadPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(parseFileInWorker).mockResolvedValue(parseChatExport(csvFixture, "fixture.csv"));
    vi.mocked(clearAllLocalChatData).mockResolvedValue();
  });

  it("moves from upload to profile setup and requires one me profile", async () => {
    const user = userEvent.setup();
    const file = new File([csvFixture], "fixture.csv", { type: "text/csv" });

    render(
      <MemoryRouter initialEntries={["/upload"]}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer/:sessionId" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.upload(screen.getByLabelText("대화 파일 선택"), file);

    expect(await screen.findByRole("heading", { name: "박형진, 세욱이형" })).toBeInTheDocument();
    expect(screen.getByText("숨김 처리 1건")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /완료/u })).toBeEnabled();

    await user.clear(screen.getByDisplayValue("박형진"));
    expect(screen.getByRole("button", { name: /완료/u })).toBeDisabled();
  });

  it("sorts the profile setup list by Korean display name", async () => {
    const user = userEvent.setup();
    const unsortedFixture = [
      "Date,User,Message",
      '2026-05-29 10:00:00,"차민","첫 메시지"',
      '2026-05-29 10:01:00,"가영","두 번째 메시지"',
      '2026-05-29 10:02:00,"나래","세 번째 메시지"'
    ].join("\n");

    vi.mocked(parseFileInWorker).mockResolvedValueOnce(parseChatExport(unsortedFixture, "fixture.csv"));

    render(
      <MemoryRouter initialEntries={["/upload"]}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer/:sessionId" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.upload(screen.getByLabelText("대화 파일 선택"), new File([unsortedFixture], "fixture.csv", { type: "text/csv" }));

    expect(await screen.findByDisplayValue("가영")).toBeInTheDocument();
    expect(screen.getAllByLabelText("이름").map((input) => (input as HTMLInputElement).value)).toEqual([
      "가영",
      "나래",
      "차민"
    ]);
  });

  it("shows a prominent loading state while a large file is being processed", async () => {
    const user = userEvent.setup();
    const pendingParse = createDeferred<ParseResult>();
    vi.mocked(parseFileInWorker).mockImplementationOnce(async (_file, onProgress) => {
      onProgress?.({ stage: "reading", loaded: 50, total: 100, percent: 50 });
      return pendingParse.promise;
    });

    render(
      <MemoryRouter initialEntries={["/upload"]}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer/:sessionId" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.upload(screen.getByLabelText("대화 파일 선택"), new File([csvFixture], "large.csv", { type: "text/csv" }));

    expect(screen.getByRole("status")).toHaveTextContent("파일을 읽는 중입니다");
    expect(screen.getByText(/50%/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /해석 중/u })).toBeDisabled();

    pendingParse.resolve(parseChatExport(csvFixture, "fixture.csv"));
    expect(await screen.findByRole("heading", { name: "박형진, 세욱이형" })).toBeInTheDocument();
  });

  it("shows a deleting indicator while clearing local data", async () => {
    const user = userEvent.setup();
    const pendingDelete = createDeferred<void>();
    vi.mocked(clearAllLocalChatData).mockReturnValueOnce(pendingDelete.promise);

    render(
      <MemoryRouter initialEntries={["/upload"]}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/viewer/:sessionId" element={<div>viewer</div>} />
        </Routes>
      </MemoryRouter>
    );

    await user.upload(screen.getByLabelText("대화 파일 선택"), new File([csvFixture], "fixture.csv", { type: "text/csv" }));
    await screen.findByRole("heading", { name: "박형진, 세욱이형" });
    await user.click(screen.getByRole("button", { name: "로컬 데이터 삭제" }));

    expect(screen.getByRole("status")).toHaveTextContent("로컬 데이터를 삭제하는 중입니다.");
    expect(screen.getByRole("button", { name: "삭제 중" })).toBeDisabled();

    pendingDelete.resolve();
    expect(await screen.findByRole("heading", { name: "TXT 또는 CSV 파일을 선택하세요" })).toBeInTheDocument();
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, reject, resolve };
}
