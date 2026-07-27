import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeTank, normalizeMaterial } from "../js/analysis.js";
import { geometry } from "../js/geometry.js";
import { optimizeTank } from "../js/optimizer.js";
import { buildCalculationAudit } from "../js/audit.js";

const catalog = JSON.parse(await readFile(new URL("../data/materials.json", import.meta.url), "utf8")).materials;
const sus304 = normalizeMaterial(catalog.find(item => item.id === "sus304"));
const base = {
  shape: "rectangular",
  widthMm: 1400,
  lengthMm: 1200,
  diameterMm: 1200,
  heightMm: 1500,
  fillHeightMm: 1400,
  hopperHeightMm: 500,
  bottomWidthMm: 300,
  bottomLengthMm: 300,
  specificGravity: 0.83,
  temperatureC: 20,
  materialId: "sus304",
  temperatureFactor: 1,
  wallThicknessMm: 6,
  bottomThicknessMm: 6,
  corrosionAllowanceMm: 1.6,
  horizontalRings: 2,
  verticalStiffeners: 1,
  horizontalSectionModulusCm3: 50,
  verticalSectionModulusCm3: 50,
  safetyFactor: 2,
  deflectionLimitMm: 5,
  supportType: "full-base",
  topFrame: true,
  closedTank: false,
  externalLoads: false,
  attachedEquipment: false
};

test("rectangular geometry and hydrostatic pressure use entered dimensions", () => {
  const result = analyzeTank(base, sus304);
  assert.deepEqual(result.errors, []);
  assert.ok(Math.abs(result.geometry.volumeM3 - 2.352) < 1e-9);
  assert.ok(Math.abs(result.hydrostatic.basePressureKpa - 11.395) < 0.002);
  assert.ok(result.wall.stressMpa > 0);
  assert.equal(result.wall.model, "사각 격자 패널의 1방향 단순지지 스트립 근사");
});

test("cylindrical hoop stress matches pD over 2t", () => {
  const input = { ...base, shape: "cylinder", wallThicknessMm: 4, corrosionAllowanceMm: 0, horizontalRings: 0, verticalStiffeners: 0 };
  const result = analyzeTank(input, sus304);
  const expected = result.hydrostatic.basePressureKpa * 1000 * 1.2 / (2 * 0.004) / 1e6;
  assert.ok(Math.abs(result.wall.stressMpa - expected) < 1e-12);
  assert.equal(result.wall.deflectionMm, null);
});

test("rectangular hopper volume follows the frustum formula", () => {
  const input = { ...base, shape: "hopper", widthMm: 2000, lengthMm: 1600, heightMm: 1800, fillHeightMm: 1800, hopperHeightMm: 600, bottomWidthMm: 400, bottomLengthMm: 300 };
  const result = geometry(input);
  const topArea = 2 * 1.6;
  const bottomArea = 0.4 * 0.3;
  const expectedHopper = 0.6 / 3 * (topArea + bottomArea + Math.sqrt(topArea * bottomArea));
  const expected = expectedHopper + topArea * 1.2;
  assert.ok(Math.abs(result.volumeM3 - expected) < 1e-12);
});

test("closed or hopper designs never receive a screening pass", () => {
  const closed = analyzeTank({ ...base, closedTank: true, wallThicknessMm: 12 }, sus304);
  const hopper = analyzeTank({ ...base, shape: "hopper", wallThicknessMm: 12 }, sus304);
  assert.equal(closed.status, "review");
  assert.equal(hopper.status, "review");
});

test("invalid fill height and missing top frame are rejected", () => {
  const result = analyzeTank({ ...base, fillHeightMm: 1600, topFrame: false }, sus304);
  assert.ok(result.errors.some(error => error.field === "fillHeightMm"));
  assert.ok(result.errors.some(error => error.field === "topFrame"));
});

test("optimizer returns only passing, unique alternatives", () => {
  const options = optimizeTank(base, sus304);
  assert.ok(options.length >= 1);
  const identities = options.map(({ candidate }) => `${candidate.input.wallThicknessMm}-${candidate.input.horizontalRings}-${candidate.input.verticalStiffeners}`);
  assert.equal(new Set(identities).size, identities.length);
  assert.ok(options.every(({ candidate }) => candidate.result.status === "screen-pass"));
});

test("missing or undersized stiffener section modulus blocks a screening pass", () => {
  const missing = analyzeTank({ ...base, horizontalSectionModulusCm3: 0 }, sus304);
  assert.equal(missing.status, "review");
  assert.equal(missing.stiffener.horizontalUtilization, null);
  const undersized = analyzeTank({ ...base, horizontalSectionModulusCm3: 0.01 }, sus304);
  assert.ok(undersized.stiffener.horizontalUtilization > 1);
  assert.equal(undersized.status, "review");
});

test("calculation audit includes formulas, substituted values, units, and basis", () => {
  const project = { schemaVersion: 2, name: "감사 추적", input: base };
  const result = analyzeTank(base, sus304);
  const rows = buildCalculationAudit(project, result);
  assert.ok(rows.length >= 15);
  assert.ok(rows.some(item => item.formula === "p = ρgh"));
  assert.ok(rows.every(item => item.substitution && item.unit !== undefined && item.basis));
});
