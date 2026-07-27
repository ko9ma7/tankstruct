import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("deployment files and documentation exist", async () => {
  const files = [
    ".nojekyll",
    "index.html",
    "css/styles.css",
    "data/materials.json",
    "js/app.js",
    "js/analysis.js",
    "js/optimizer.js",
    "README.md",
    "docs/CALCULATION_BASIS.md",
    "docs/USER_GUIDE.md",
    "docs/LIMITATIONS.md"
  ];
  await Promise.all(files.map(file => access(path.join(root, file))));
});

test("Sites build emits a Worker entrypoint and hosting metadata", async () => {
  const files = [
    "dist/server/index.js",
    "dist/.openai/hosting.json",
    "dist/index.html"
  ];
  await Promise.all(files.map(file => access(path.join(root, file))));
  const worker = await readFile(path.join(root, "dist/server/index.js"), "utf8");
  assert.match(worker, /export default/);
  assert.match(worker, /content-security-policy/);
});

test("GitHub Pages assets use relative paths", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/);
  assert.match(html, /id="tankForm"/);
  assert.match(html, /id="results"/);
  assert.match(html, /제작 승인용 계산서가 아닙니다/);
});

test("material presets disclose their evidence quality", async () => {
  const data = JSON.parse(await readFile(path.join(root, "data/materials.json"), "utf8"));
  assert.ok(data.materials.length >= 4);
  for (const material of data.materials) {
    assert.ok(material.note);
    assert.ok(material.sourceQuality);
    assert.ok(material.standardThicknessesMm.length);
  }
});
