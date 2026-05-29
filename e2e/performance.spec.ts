import { expect, test } from "@playwright/test";

const largeFixture = [
  "Date,User,Message",
  ...Array.from({ length: 5_000 }, (_, index) => {
    const day = index < 2_500 ? "26" : "27";
    const minute = String(index % 60).padStart(2, "0");
    const user = index % 2 === 0 ? "박형진" : "세욱이형";
    return `2026-05-${day} 12:${minute}:00,"${user}","대량 메시지 ${index + 1}"`;
  })
].join("\n");

test("keeps large chat rendering virtualized", async ({ page }) => {
  await page.goto("/upload");
  await page.getByLabel("대화 파일 선택").setInputFiles({
    name: "large.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(largeFixture)
  });

  await expect(page.getByRole("heading", { name: "박형진, 세욱이형" })).toBeVisible();
  await page.getByRole("button", { name: /완료/u }).click({ noWaitAfter: true });

  await expect(page).toHaveURL(/\/viewer\/session-/u);
  await expect(page.getByText("대량 메시지 5000")).toBeVisible();
  await expect.poll(async () => page.locator(".virtual-row").count()).toBeLessThan(80);
});
