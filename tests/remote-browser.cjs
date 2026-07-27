const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const url = process.env.TANKSTRUCT_URL || "https://ko9ma7.github.io/tankstruct/";
const shot = path.join(__dirname, "..", "assets", "screenshots", "08-github-pages-live.png");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  await page.waitForSelector("#results:not([hidden])");
  assert.match(await page.title(), /TankStruct/);
  assert.equal(await page.evaluate(() => fetch("./js/app.js").then(result => result.ok)), true);
  assert.equal(await page.evaluate(() => fetch("./docs/calculation-basis.html").then(result => result.ok)), true);
  assert.match(await page.locator("#calculationSteps").textContent(), /입력값 대입/);

  await page.locator("#helpButton").click();
  assert.ok((await page.locator(".guide-steps li > div").first().boundingBox()).width > 250);
  await page.locator("[data-close-dialog]").click();

  const pngPromise = page.waitForEvent("download");
  await page.locator("#pngButton").click();
  const png = await pngPromise;
  assert.ok(fs.statSync(await png.path()).size > 10000);
  const pdfPromise = page.waitForEvent("download");
  await page.locator("#pdfButton").click();
  const pdf = await pdfPromise;
  assert.ok(fs.statSync(await pdf.path()).size > 10000);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#results:not([hidden])");
  assert.match(await page.locator("#toast").textContent(), /이전 작업/);
  await page.screenshot({ path: shot, fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(`remote browser: ${url} assets, restore, help, PNG, PDF, mobile passed`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
