import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseChatExport } from "../domain/parser";
import type { ParseResult } from "../domain/chatTypes";
import { csvFixture } from "../test/fixtures";
import { UploadPage } from "./UploadPage";
import { parseFileInWorker } from "../services/parseClient";

vi.mock("../services/parseClient", () => ({
  parseFileInWorker: vi.fn(async () => parseChatExport(csvFixture, "fixture.csv"))
}));

vi.mock("../storage/chatSessionStore", async () => {
  const actual = await vi.importActual<typeof import("../storage/chatSessionStore")>("../storage/chatSessionStore");
  return {
    ...actual,
    saveSession: vi.fn()
  };
});

describe("UploadPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(parseFileInWorker).mockResolvedValue(parseChatExport(csvFixture, "fixture.csv"));
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
