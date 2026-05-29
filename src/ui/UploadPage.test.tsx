import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseChatExport } from "../domain/parser";
import { csvFixture } from "../test/fixtures";
import { UploadPage } from "./UploadPage";

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
});
