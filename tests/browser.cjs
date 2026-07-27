const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.join(__dirname, "..");
const shotDir = path.join(root, "assets", "screenshots");
fs.mkdirSync(shotDir, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", colorScheme: "light", acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert.match(await page.title(), /TankStruct/);
  await page.waitForSelector("#results:not([hidden])");
  assert.match(await page.locator("#liveVolume").textContent(), /2,352/);
  assert.match(await page.locator("#metricGrid").textContent(), /응력 사용률/);
  assert.ok(await page.locator(".option-card").count() >= 1);
  assert.match(await page.locator("#tankVisual").textContent(), /정면도/);
  assert.match(await page.locator("#tankVisual").textContent(), /평면도/);
  assert.ok(await page.locator(".formula-table tbody tr").count() >= 15);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(shotDir, "01-overview-desktop.png"), fullPage: true });
  await page.locator(".workspace").screenshot({ path: path.join(shotDir, "02-calculator-workspace.png") });
  await page.locator("#results").screenshot({ path: path.join(shotDir, "03-analysis-results.png") });

  await page.locator('input[name="shape"][value="cylinder"]').check();
  await page.locator("#diameterMm").fill("1800");
  await page.locator('#tankForm button[type="submit"]').click();
  assert.match(await page.locator("#modelBadge").textContent(), /얇은막 원통/);
  assert.match(await page.locator("#calculationSteps").textContent(), /둘레응력/);

  await page.locator('input[name="shape"][value="rectangular"]').check();
  await page.locator("#fillHeightMm").fill("1800");
  await page.locator("#heightMm").fill("1500");
  await page.locator('#tankForm button[type="submit"]').click();
  assert.equal(await page.locator("#fillHeightMm").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#formMessage").textContent(), /탱크 높이/);
  await page.locator("#fillHeightMm").fill("1400");
  await page.locator('#tankForm button[type="submit"]').click();

  const csvDownload = page.waitForEvent("download");
  await page.locator("#csvButton").click();
  assert.match((await csvDownload).suggestedFilename(), /_결과\.csv$/);
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#projectButton").click();
  assert.match((await jsonDownload).suggestedFilename(), /\.tank\.json$/);
  const pngDownload = page.waitForEvent("download");
  await page.locator("#pngButton").click();
  const png = await pngDownload;
  assert.match(png.suggestedFilename(), /_계산서\.png$/);
  assert.ok(fs.statSync(await png.path()).size > 10000);
  const pdfDownload = page.waitForEvent("download");
  await page.locator("#pdfButton").click();
  const pdf = await pdfDownload;
  assert.match(pdf.suggestedFilename(), /_계산서\.pdf$/);
  assert.ok(fs.statSync(await pdf.path()).size > 10000);

  await page.locator("#helpButton").click();
  await page.waitForSelector("#helpDialog[open]");
  assert.equal(await page.locator(".guide-steps li").evaluateAll(items => items.every(item => item.scrollWidth <= item.clientWidth)), true);
  assert.ok((await page.locator(".guide-steps li > div").first().boundingBox()).width > 250);
  await page.screenshot({ path: path.join(shotDir, "06-help-modal.png") });
  await page.locator("[data-close-dialog]").click();

  const docsPage = await context.newPage();
  await docsPage.goto(`${baseUrl}/docs/calculation-basis.html`, { waitUntil: "networkidle" });
  assert.match(await docsPage.title(), /계산 근거/);
  assert.match(await docsPage.locator("article").textContent(), /σmax/);
  assert.notEqual(await docsPage.locator("header").evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
  await docsPage.screenshot({ path: path.join(shotDir, "07-calculation-basis.png"), fullPage: true });
  await docsPage.close();

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#results:not([hidden])");
  assert.match(await page.locator("#toast").textContent(), /이전 작업/);
  await page.locator("#themeButton").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#themeButton").click();
  await page.evaluate(() => scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(shotDir, "04-overview-mobile.png") });
  await page.locator("#results").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(shotDir, "05-results-mobile.png") });

  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".workspace").evaluate(element => getComputedStyle(element).display), "none");
  assert.notEqual(await page.locator("#results").evaluate(element => getComputedStyle(element).display), "none");
  await page.emulateMedia({ media: "screen" });

  assert.deepEqual(errors, []);
  await browser.close();
  server.close();
  console.log("browser: desktop, calculation, validation, export, restore, dark, mobile, print passed");
})().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
