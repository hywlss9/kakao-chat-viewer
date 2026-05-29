import { expect, test } from "@playwright/test";

const fixture = `Date,User,Message
2021-05-26 16:02:26,"","Chat Loss"
2021-05-26 16:02:39,"박형진","형 생일축하해"
2021-05-26 16:52:16,"세욱이형","고마워"
2021-10-20 02:29:35,"세욱이형","파일: report.pdf"
2021-10-20 07:05:46,"박형진","사진"`;

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
  await expect(page.getByText("형 생일축하해")).toBeVisible();
  await expect(page.getByText("report.pdf")).toBeVisible();
  await expect(page.getByLabel("날짜로 이동")).toBeVisible();

  const shell = page.getByTestId("mobile-shell");
  const box = await shell.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(isMobile ? 430 : 431);
});
