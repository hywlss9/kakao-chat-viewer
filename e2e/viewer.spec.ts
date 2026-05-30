import { expect, test, type Page } from "@playwright/test";

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

const smallFixture = [
  "Date,User,Message",
  '2026-05-28 09:59:00,"박형진","첫날 내 메시지"',
  '2026-05-28 10:00:00,"세욱이형","첫날 메시지"',
  '2026-05-29 09:00:00,"박형진","둘째날 시작"',
  '2026-05-29 09:01:10,"세욱이형","같은 분 메시지 1"',
  '2026-05-29 09:01:20,"세욱이형","같은 분 메시지 2"',
  '2026-05-29 09:02:00,"박형진","작은 대화 최신"'
].join("\n");

test("uploads a file, configures profiles, and opens the mobile viewer", async ({ page, isMobile }) => {
  await page.goto("/upload");
  await page.getByLabel("대화 파일 선택").setInputFiles({
    name: "fixture.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(fixture)
  });

  await expect(page.getByRole("heading", { name: /박형진.*세욱이형|세욱이형.*박형진/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /완료/u })).toBeEnabled();
  await page.getByRole("button", { name: /완료/u }).click({ noWaitAfter: true });

  await expect(page).toHaveURL(/\/viewer\/session-/u);
  await expect(page.getByRole("heading", { name: /박형진.*세욱이형|세욱이형.*박형진/u })).toBeVisible();
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

test("keeps small chats stable when jumping between dates", async ({ page }) => {
  await page.goto("/upload");
  await page.getByLabel("대화 파일 선택").setInputFiles({
    name: "small.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(smallFixture)
  });

  await expect(page.getByRole("heading", { name: /박형진.*세욱이형|세욱이형.*박형진/u })).toBeVisible();
  await page.getByRole("button", { name: /완료/u }).click({ noWaitAfter: true });

  await expect(page).toHaveURL(/\/viewer\/session-/u);
  await expect(page.getByText("작은 대화 최신")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByLabel("날짜로 이동").evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)
    )
    .toContain("2026년 5월 29일");

  await expect(page.getByTestId("sender-name").filter({ hasText: "세욱이형" })).toHaveCount(2);
  await expect(page.getByTestId("message-time").filter({ hasText: "오전 9:01" })).toHaveCount(1);

  await page.getByLabel("날짜로 이동").selectOption(await getDateSelectValue(page, "2026년 5월 28일"));
  await expect(page.getByText("첫날 메시지")).toBeVisible();
  await expect
    .poll(async () =>
      page.getByLabel("날짜로 이동").evaluate((select) => (select as HTMLSelectElement).selectedOptions[0]?.textContent)
    )
    .toContain("2026년 5월 28일");

  await page.getByLabel("날짜로 이동").selectOption(await getDateSelectValue(page, "2026년 5월 29일"));
  await expect(page.getByText("작은 대화 최신")).toBeVisible();
});

async function getDateSelectValue(page: Page, labelPart: string): Promise<string> {
  return page.getByLabel("날짜로 이동").evaluate((select, nextLabelPart) => {
    const option = Array.from((select as HTMLSelectElement).options).find((dateOption) =>
      dateOption.textContent?.includes(nextLabelPart)
    );

    if (!option) {
      throw new Error(`Date option not found: ${nextLabelPart}`);
    }

    return option.value;
  }, labelPart);
}
