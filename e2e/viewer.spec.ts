import { expect, test } from "@playwright/test";

const fixture = [
  "Date,User,Message",
  '2021-05-26 16:02:26,"","Chat Loss"',
  ...Array.from(
    { length: 40 },
    (_, index) =>
      `2021-05-26 16:${String(index + 3).padStart(2, "0")}:00,"박형진","이전 메시지 ${index + 1}"`
  ),
  '2021-10-20 02:29:35,"세욱이형","파일: report.pdf"',
  '2021-10-20 07:05:46,"박형진","사진"',
  '2021-10-20 07:06:10,"세욱이형","연속 메시지 1"',
  '2021-10-20 07:06:20,"세욱이형","연속 메시지 2"',
  '2021-10-20 07:06:46,"세욱이형","최신 메시지"'
].join("\n");

test("uploads a file, configures profiles, and opens the mobile viewer", async ({ page, isMobile }) => {
  await page.goto("/upload");
  await page.getByLabel("대화 파일 선택").setInputFiles({
    name: "fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(fixture)
  });

  await expect(page.getByRole("heading", { name: "박형진, 세욱이형" })).toBeVisible();
  await expect(page.getByRole("button", { name: /완료/u })).toBeEnabled();
  await page.getByRole("button", { name: /완료/u }).click({ noWaitAfter: true });

  await expect(page).toHaveURL(/\/viewer\/session-/u);
  await expect(page.getByRole("heading", { name: "박형진, 세욱이형" })).toBeVisible();
  await expect(page.getByText("최신 메시지")).toBeVisible();
  await expect(page.getByText("연속 메시지 1")).toBeVisible();
  await expect(page.getByText("연속 메시지 2")).toBeVisible();
  await expect(page.getByTestId("message-time").filter({ hasText: "오전 7:06" })).toHaveCount(1);
  await expect(page.getByText("report.pdf")).toBeVisible();
  await expect(page.getByLabel("날짜로 이동")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByLabel("날짜로 이동").evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)
    )
    .toContain("2021년 10월 20일");

  await page.getByTestId("message-list").evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect
    .poll(async () =>
      page.getByLabel("날짜로 이동").evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)
    )
    .toContain("2021년 5월 26일");

  const shell = page.getByTestId("mobile-shell");
  const box = await shell.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(isMobile ? 430 : 431);
});
