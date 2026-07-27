import { analyzeTank, normalizeMaterial } from "./analysis.js";
import { geometry } from "./geometry.js";
import { optimizeTank } from "./optimizer.js";
import { clearProject, loadProject, saveProject } from "./storage.js";
import { downloadProject, downloadResultCsv, readProjectFile } from "./export.js";
import { buildCalculationAudit } from "./audit.js";
import { downloadReportPdf, downloadReportPng } from "./report.js";

const $ = selector => document.querySelector(selector);
const form = $("#tankForm");
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const compactNumber = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const defaultInput = {
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

let materialCatalog = [];
let latestProject = null;
let latestResult = null;
let saveTimer = null;
let toastTimer = null;

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 2600);
}

function selectedShape() {
  return form.elements.shape.value;
}

function shapeLabel(shape) {
  return ({ rectangular: "사각", cylinder: "원통", hopper: "호퍼" })[shape] ?? shape;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (!element || value === undefined || value === null) return;
  if (element.type === "checkbox") element.checked = Boolean(value);
  else element.value = value;
}

function getInput() {
  const value = id => Number(document.getElementById(id).value);
  return {
    shape: selectedShape(),
    widthMm: value("widthMm"),
    lengthMm: value("lengthMm"),
    diameterMm: value("diameterMm"),
    heightMm: value("heightMm"),
    fillHeightMm: value("fillHeightMm"),
    hopperHeightMm: value("hopperHeightMm"),
    bottomWidthMm: value("bottomWidthMm"),
    bottomLengthMm: value("bottomLengthMm"),
    specificGravity: value("specificGravity"),
    temperatureC: value("temperatureC"),
    materialId: $("#materialId").value,
    temperatureFactor: value("temperatureFactor"),
    wallThicknessMm: value("wallThicknessMm"),
    bottomThicknessMm: value("bottomThicknessMm"),
    corrosionAllowanceMm: value("corrosionAllowanceMm"),
    horizontalRings: value("horizontalRings"),
    verticalStiffeners: value("verticalStiffeners"),
    horizontalSectionModulusCm3: value("horizontalSectionModulusCm3"),
    verticalSectionModulusCm3: value("verticalSectionModulusCm3"),
    safetyFactor: value("safetyFactor"),
    deflectionLimitMm: value("deflectionLimitMm"),
    supportType: $("#supportType").value,
    topFrame: $("#topFrame").checked,
    closedTank: $("#closedTank").checked,
    externalLoads: $("#externalLoads").checked,
    attachedEquipment: $("#attachedEquipment").checked
  };
}

function getMaterial() {
  const base = materialCatalog.find(item => item.id === $("#materialId").value) ?? materialCatalog[0];
  return normalizeMaterial(base, {
    densityKgM3: $("#densityKgM3").value,
    elasticModulusMpa: $("#elasticModulusMpa").value,
    referenceStrengthMpa: $("#referenceStrengthMpa").value,
    creepFactor: $("#creepFactor").value,
    jointEfficiency: $("#jointEfficiency").value
  });
}

function project() {
  return {
    schemaVersion: 2,
    appVersion: "0.2.0",
    name: $("#projectName").value.trim() || "새 탱크 검토",
    input: getInput(),
    materialOverrides: {
      densityKgM3: Number($("#densityKgM3").value),
      elasticModulusMpa: Number($("#elasticModulusMpa").value),
      referenceStrengthMpa: Number($("#referenceStrengthMpa").value),
      creepFactor: Number($("#creepFactor").value),
      jointEfficiency: Number($("#jointEfficiency").value)
    },
    updatedAt: new Date().toISOString()
  };
}

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveProject(project()), 220);
}

function materialFields(material, overrides) {
  setValue("densityKgM3", overrides?.densityKgM3 ?? material.densityKgM3);
  setValue("elasticModulusMpa", overrides?.elasticModulusMpa ?? material.elasticModulusMpa);
  setValue("referenceStrengthMpa", overrides?.referenceStrengthMpa ?? material.referenceStrengthMpa);
  setValue("creepFactor", overrides?.creepFactor ?? material.creepFactor);
  setValue("jointEfficiency", overrides?.jointEfficiency ?? material.jointEfficiency);
  $("#materialNote").textContent = material.note;
}

function applyShapeUI() {
  const shape = selectedShape();
  document.querySelectorAll(".shape-rect").forEach(element => { element.hidden = shape === "cylinder"; });
  document.querySelectorAll(".shape-cylinder").forEach(element => { element.hidden = shape !== "cylinder"; });
  document.querySelectorAll(".hopper-fields").forEach(element => { element.hidden = shape !== "hopper"; });
  document.querySelectorAll(".rect-only").forEach(element => { element.hidden = shape === "cylinder"; });
  $("#modelBadge").textContent = shape === "cylinder" ? "얇은막 원통" : shape === "hopper" ? "호퍼 용량 + 측판" : "사각 격자 패널";
}

function loadIntoForm(data) {
  $("#projectName").value = data.name || "새 탱크 검토";
  Object.entries({ ...defaultInput, ...data.input }).forEach(([id, value]) => {
    if (id === "shape") {
      const radio = form.querySelector(`input[name="shape"][value="${value}"]`);
      if (radio) radio.checked = true;
    } else {
      setValue(id, value);
    }
  });
  const material = materialCatalog.find(item => item.id === $("#materialId").value) ?? materialCatalog[0];
  materialFields(material, data.materialOverrides);
  applyShapeUI();
  updateVisual();
}

function visualDefinitions() {
  return `
    <defs>
      <pattern id="liquidHatch" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" class="hatch-bg"/>
        <path d="M-2 10 10-2M4 12 12 4" class="hatch-line"/>
      </pattern>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="m0 0 8 4-8 4z" fill="currentColor"/></marker>
    </defs>`;
}

function pressureArrows(yTop, yBottom, startX = 365) {
  return [0.18, 0.42, 0.67, 0.9].map((ratio, index) => {
    const y = yTop + (yBottom - yTop) * ratio;
    const length = 14 + index * 11;
    return `<path class="pressure-arrow" d="M${startX + length} ${y}H${startX}"/>`;
  }).join("");
}

function rectangularVisual(input) {
  const fillRatio = Math.min(1, input.fillHeightMm / input.heightMm);
  const liquidY = 322 - 250 * fillRatio;
  const horizontal = Array.from({ length: input.horizontalRings }, (_, index) => {
    const y = 72 + 250 * (index + 1) / (input.horizontalRings + 1);
    return `<path class="stiffener-line" d="M92 ${y}H362"/>`;
  }).join("");
  const vertical = Array.from({ length: input.verticalStiffeners }, (_, index) => {
    const x = 96 + 262 * (index + 1) / (input.verticalStiffeners + 1);
    return `<path class="stiffener-line" d="M${x} 68V326"/>`;
  }).join("");
  return `<svg viewBox="0 0 680 420" role="img" aria-label="사각 탱크 정면도와 평면도">
    ${visualDefinitions()}
    <text class="view-title" x="228" y="38" text-anchor="middle">정면도 · 수압/보강</text>
    <rect class="tank-liquid" x="96" y="${liquidY}" width="262" height="${322 - liquidY}" fill="url(#liquidHatch)"/>
    <rect class="tank-outline" x="96" y="72" width="262" height="250"/>
    <path class="liquid-surface" d="M96 ${liquidY}H358"/>
    ${horizontal}${vertical}${pressureArrows(liquidY, 322)}
    <path class="pressure-triangle" d="M365 ${liquidY}V322h58z"/>
    <text class="drawing-note" x="402" y="342" text-anchor="middle">pmax</text>
    <path class="dimension-line" d="M74 72v250M68 72h12M68 322h12"/>
    <text class="tank-dimension" x="50" y="200" transform="rotate(-90 50 200)" text-anchor="middle">H ${number.format(input.heightMm)} mm</text>
    <text class="view-title" x="542" y="38" text-anchor="middle">평면도</text>
    <rect class="tank-outline" x="458" y="126" width="168" height="126"/>
    <path class="center-line" d="M542 105v168M438 189h208"/>
    <path class="dimension-line" d="M458 278h168M458 272v12M626 272v12"/>
    <text class="tank-dimension" x="542" y="300" text-anchor="middle">W ${number.format(input.widthMm)} mm</text>
    <path class="dimension-line" d="M650 126v126M644 126h12M644 252h12"/>
    <text class="tank-dimension" x="674" y="189" transform="rotate(-90 674 189)" text-anchor="middle">L ${number.format(input.lengthMm)} mm</text>
    <text class="drawing-note" x="96" y="385">실선: 판 경계 · 굵은 청색: 보강재 · 사선: 액체</text>
  </svg>`;
}

function cylinderVisual(input) {
  const fillRatio = Math.min(1, input.fillHeightMm / input.heightMm);
  const liquidY = 322 - 250 * fillRatio;
  return `<svg viewBox="0 0 680 420" role="img" aria-label="원통 탱크 정면도와 평면도">
    ${visualDefinitions()}
    <text class="view-title" x="228" y="38" text-anchor="middle">정면도 · 얇은막 둘레응력</text>
    <rect class="tank-liquid" x="96" y="${liquidY}" width="262" height="${322 - liquidY}" fill="url(#liquidHatch)"/>
    <path class="tank-outline" d="M96 72v250h262V72M96 72q131-34 262 0"/>
    <path class="liquid-surface" d="M96 ${liquidY}H358"/>
    ${pressureArrows(liquidY, 322)}
    <path class="pressure-triangle" d="M365 ${liquidY}V322h58z"/>
    <path class="dimension-line" d="M74 72v250M68 72h12M68 322h12"/>
    <text class="tank-dimension" x="50" y="200" transform="rotate(-90 50 200)" text-anchor="middle">H ${number.format(input.heightMm)} mm</text>
    <text class="view-title" x="542" y="38" text-anchor="middle">평면도</text>
    <circle class="tank-outline" cx="542" cy="190" r="84"/>
    <path class="center-line" d="M542 90v200M442 190h200"/>
    <path class="dimension-line" d="M458 300h168M458 294v12M626 294v12"/>
    <text class="tank-dimension" x="542" y="322" text-anchor="middle">D ${number.format(input.diameterMm)} mm</text>
    <text class="drawing-note" x="96" y="385">바닥 최대 수압으로 원통 둘레응력을 계산합니다.</text>
  </svg>`;
}

function hopperVisual(input) {
  const fillRatio = Math.min(1, input.fillHeightMm / input.heightMm);
  const liquidY = 322 - 250 * fillRatio;
  const horizontal = Array.from({ length: input.horizontalRings }, (_, index) => {
    const y = 72 + 145 * (index + 1) / (input.horizontalRings + 1);
    return `<path class="stiffener-line" d="M92 ${y}H362"/>`;
  }).join("");
  return `<svg viewBox="0 0 680 420" role="img" aria-label="호퍼 탱크 정면도와 평면도">
    ${visualDefinitions()}
    <text class="view-title" x="228" y="38" text-anchor="middle">정면도 · 용량/측판</text>
    <path class="tank-liquid" d="M96 ${liquidY}H358V218L290 322H164L96 218z" fill="url(#liquidHatch)"/>
    <path class="tank-outline" d="M96 72h262v146L290 322H164L96 218z"/>
    <path class="liquid-surface" d="M96 ${liquidY}H358"/>
    ${horizontal}${pressureArrows(liquidY, 306)}
    <path class="pressure-triangle" d="M365 ${liquidY}V306h58z"/>
    <text class="view-title" x="542" y="38" text-anchor="middle">평면도 · 상/하부</text>
    <rect class="tank-outline" x="458" y="116" width="168" height="144"/>
    <rect class="tank-outline secondary-outline" x="510" y="158" width="64" height="60"/>
    <path class="center-line" d="M542 96v184M438 188h208"/>
    <text class="tank-dimension" x="542" y="292" text-anchor="middle">상부 ${number.format(input.widthMm)} × ${number.format(input.lengthMm)} mm</text>
    <text class="tank-dimension" x="542" y="317" text-anchor="middle">하부 ${number.format(input.bottomWidthMm)} × ${number.format(input.bottomLengthMm)} mm</text>
    <text class="drawing-note" x="96" y="385">호퍼 경사판·전이부·배출구는 구조 판정에서 제외됩니다.</text>
  </svg>`;
}

function updateVisual() {
  applyShapeUI();
  const input = getInput();
  $("#tankVisual").innerHTML = input.shape === "cylinder" ? cylinderVisual(input) : input.shape === "hopper" ? hopperVisual(input) : rectangularVisual(input);
  try {
    const geom = geometry(input);
    const volumeL = geom.volumeM3 * 1000;
    $("#liveVolume").textContent = `${compactNumber.format(volumeL)} L`;
    $("#liveLiquidMass").textContent = `${compactNumber.format(volumeL * input.specificGravity)} kg`;
    $("#livePressure").textContent = `${compactNumber.format(input.specificGravity * 1000 * 9.80665 * input.fillHeightMm / 1e6)} kPa`;
  } catch {
    $("#liveVolume").textContent = "-";
    $("#liveLiquidMass").textContent = "-";
    $("#livePressure").textContent = "-";
  }
}

function clearErrors() {
  form.querySelectorAll('[aria-invalid="true"]').forEach(element => element.removeAttribute("aria-invalid"));
  $("#formMessage").hidden = true;
}

function showErrors(errors) {
  clearErrors();
  for (const error of errors) document.getElementById(error.field)?.setAttribute("aria-invalid", "true");
  $("#formMessage").textContent = errors[0]?.message ?? "입력값을 확인하세요.";
  $("#formMessage").hidden = false;
  const first = form.querySelector('[aria-invalid="true"]');
  first?.focus({ preventScroll: true });
  (first ?? $("#formMessage")).scrollIntoView({ behavior: "smooth", block: "center" });
}

function resultMetrics(result) {
  const metrics = [
    ["계산 용량", result.geometry.volumeM3 * 1000, "L", `만수 ${compactNumber.format(result.geometry.fullVolumeM3 * 1000)} L`],
    ["바닥 최대 수압", result.hydrostatic.basePressureKpa, "kPa", `압력 중심: 바닥 위 ${compactNumber.format(result.hydrostatic.centerOfPressureFromBottomM)} m`],
    ["응력 사용률", result.wall.stressUtilization * 100, "%", `${compactNumber.format(result.wall.stressMpa)} / ${compactNumber.format(result.material.allowableStressMpa)} MPa`],
    ["예상 변형", result.wall.deflectionMm ?? 0, result.wall.deflectionMm === null ? "N/A" : "mm", result.wall.deflectionMm === null ? "원통 막응력 모델은 변형 미산정" : `한도 ${compactNumber.format(getInput().deflectionLimitMm)} mm`],
    ["판재 추정 중량", result.bom.plateMassKg, "kg", "측판+바닥판, 보강재 제외"]
  ];
  $("#metricGrid").innerHTML = metrics.map(([label, value, unit, note]) => `
    <div class="metric"><span>${label}</span><strong>${unit === "N/A" ? "미산정" : compactNumber.format(value)}<small>${unit === "N/A" ? "" : unit}</small></strong><em>${note}</em></div>
  `).join("");
}

function renderStatus(result) {
  const pass = result.status === "screen-pass";
  $("#statusBanner").className = `status-banner ${pass ? "pass" : "review"}`;
  $("#statusBanner").innerHTML = `
    <span class="status-mark">${pass ? "✓" : "!"}</span>
    <div>
      <strong>${pass ? "입력한 단순 모델 범위에서는 목표 조건 이내입니다." : "현재 조건은 추가 검토 또는 설계 변경이 필요합니다."}</strong>
      <p>${pass ? "통과는 제작 승인이 아닙니다. 보강 프로파일·용접·기초·노즐과 적용 규격을 이어서 확인하세요." : "경고 항목을 확인하고 두께·보강·재료 물성 또는 적용 해석 방법을 다시 검토하세요."}</p>
    </div>`;
}

function renderOptimizer(input, material) {
  const options = optimizeTank(input, material);
  if (!options.length) {
    $("#optimizerResults").innerHTML = `<div class="empty-options">현재 프리셋 두께와 보강 범위에서 조건을 만족하는 비교안을 찾지 못했습니다. 사용자 정의 두께를 검토하거나 전문 구조해석으로 전환하세요.</div>`;
    return;
  }
  $("#optimizerResults").innerHTML = `<div class="option-list">${options.map(({ strategy, candidate }, index) => `
    <button class="option-card ${index === 0 ? "recommended" : ""}" type="button"
      data-thickness="${candidate.input.wallThicknessMm}"
      data-horizontal="${candidate.input.horizontalRings}"
      data-vertical="${candidate.input.verticalStiffeners}">
      <span><strong>${strategy}${index === 0 ? " · 추천" : ""}</strong><small>사용률 ${compactNumber.format(candidate.result.utilization * 100)}%</small></span>
      <span class="option-spec">판 ${candidate.input.wallThicknessMm} mm · 수평 ${candidate.input.horizontalRings}줄 · 수직 ${candidate.input.verticalStiffeners}개/면</span>
      <span class="option-mass"><b>${compactNumber.format(candidate.plateMassKg)} kg</b><small>판재</small></span>
    </button>`).join("")}</div>`;
}

function renderCalculation(projectData, result) {
  const rows = buildCalculationAudit(projectData, result);
  $("#calculationSteps").innerHTML = `<table class="formula-table">
    <thead><tr><th>구분</th><th>항목·공식</th><th>입력값 대입</th><th>결과</th><th>근거</th></tr></thead>
    <tbody>${rows.map(item => `<tr>
      <td><span class="formula-category">${escapeHTML(item.category)}</span></td>
      <td><strong>${escapeHTML(item.title)}</strong><code>${escapeHTML(item.formula)}</code></td>
      <td>${escapeHTML(item.substitution)}</td>
      <td class="formula-result"><b>${escapeHTML(item.value)}</b> ${escapeHTML(item.unit)}</td>
      <td>${escapeHTML(item.basis)}</td>
    </tr>`).join("")}</tbody>
  </table>`;
}

function renderUtilization(result) {
  const checks = [
    ["측판 응력", result.wall.stressUtilization],
    ["측판 변형", result.wall.deflectionUtilization],
    ["수평 보강 Z", result.stiffener?.horizontalUtilization],
    ["수직 보강 Z", result.stiffener?.verticalUtilization]
  ].filter(([, value]) => value !== null && value !== undefined);
  $("#utilizationChart").innerHTML = checks.map(([label, value]) => {
    const percent = value * 100;
    const width = Math.min(100, Math.max(1, percent));
    const state = percent <= 80 ? "safe" : percent <= 100 ? "caution" : "over";
    return `<div class="utilization-row">
      <div class="utilization-label"><span>${label}</span><strong>${compactNumber.format(percent)}%</strong></div>
      <div class="utilization-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
        <span class="${state}" style="width:${width}%"></span><i aria-hidden="true"></i>
      </div>
    </div>`;
  }).join("");
}

function renderBom(result) {
  $("#bomTable").innerHTML = `<table><thead><tr><th>부품</th><th>주요 사양</th><th class="number">수량</th><th>단위</th></tr></thead><tbody>${result.bom.items.map(item => `
    <tr><td><strong>${escapeHTML(item.item)}</strong></td><td>${escapeHTML(item.specification)}</td><td class="number">${number.format(item.quantity)}</td><td>${escapeHTML(item.unit)}</td></tr>
  `).join("")}</tbody></table>`;
}

function renderWarnings(result) {
  const confidence = result.confidence;
  $("#confidenceBadge").textContent = `근거 신뢰도 ${confidence.level}`;
  const warnings = [
    ...result.warnings,
    ...confidence.reasons,
    "최종 두께는 공칭 판 두께의 음의 공차, 성형·연마 감소, 부식·마모 여유를 포함해 결정하세요."
  ];
  $("#warningList").innerHTML = `<div class="warning-list">${warnings.map(item => `<div class="warning-item">${escapeHTML(item)}</div>`).join("")}</div>`;
  $("#assumptionList").innerHTML = result.assumptions.map(item => `<li>${escapeHTML(item)}</li>`).join("");
}

function renderResults(projectData, result, material) {
  latestProject = projectData;
  latestResult = result;
  $("#results").hidden = false;
  $("#resultTitle").textContent = `${projectData.name} · ${shapeLabel(projectData.input.shape)} 탱크`;
  $("#resultMeta").textContent = `${result.material.name} · 판 ${projectData.input.wallThicknessMm} mm · 안전계수 ${projectData.input.safetyFactor} · ${new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`;
  renderStatus(result);
  resultMetrics(result);
  renderOptimizer(projectData.input, material);
  renderCalculation(projectData, result);
  renderUtilization(result);
  renderBom(result);
  renderWarnings(result);
}

function runCalculation(shouldScroll = true) {
  const projectData = project();
  const material = getMaterial();
  const result = analyzeTank(projectData.input, material);
  if (result.errors.length) {
    showErrors(result.errors);
    return false;
  }
  clearErrors();
  renderResults(projectData, result, material);
  saveProject(projectData);
  if (shouldScroll) $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function applyExample() {
  loadIntoForm({ schemaVersion: 2, name: "2톤 사각 탱크", input: defaultInput });
  queueSave();
  runCalculation(false);
  toast("검증용 예시 조건을 불러왔습니다.");
}

async function initialize() {
  const response = await fetch("./data/materials.json");
  if (!response.ok) throw new Error("재료 데이터 파일을 불러오지 못했습니다.");
  const data = await response.json();
  materialCatalog = data.materials;
  $("#materialId").innerHTML = materialCatalog.map(item => `<option value="${item.id}">${item.name}</option>`).join("");
  const saved = loadProject();
  if (saved) {
    loadIntoForm(saved);
    runCalculation(false);
    toast("이전 작업을 복원했습니다.");
  } else {
    applyExample();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();
  runCalculation(true);
});
form.addEventListener("input", () => {
  updateVisual();
  queueSave();
});
form.addEventListener("change", event => {
  if (event.target.name === "shape") applyShapeUI();
  if (event.target.id === "materialId") {
    const material = materialCatalog.find(item => item.id === event.target.value);
    materialFields(material);
  }
  updateVisual();
  queueSave();
});

$("#optimizerResults").addEventListener("click", event => {
  const button = event.target.closest(".option-card");
  if (!button) return;
  setValue("wallThicknessMm", button.dataset.thickness);
  setValue("horizontalRings", button.dataset.horizontal);
  setValue("verticalStiffeners", button.dataset.vertical);
  updateVisual();
  runCalculation(false);
  $("#statusBanner").scrollIntoView({ behavior: "smooth", block: "center" });
  toast("선택한 비교안을 현재 제작안에 적용했습니다.");
});

$("#exampleButton").addEventListener("click", () => {
  if (!confirm("현재 입력을 예시 조건으로 바꿀까요? JSON 백업을 하지 않은 변경은 덮어씁니다.")) return;
  clearProject();
  applyExample();
});
$("#importButton").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", async event => {
  try {
    const data = await readProjectFile(event.target.files[0]);
    loadIntoForm(data);
    runCalculation(false);
    toast("프로젝트를 불러왔습니다.");
  } catch (error) {
    toast(error.message);
  } finally {
    event.target.value = "";
  }
});

$("#csvButton").addEventListener("click", () => {
  if (!latestResult && !runCalculation(false)) return;
  downloadResultCsv(latestProject, latestResult);
});
$("#projectButton").addEventListener("click", () => {
  downloadProject(project());
  toast("JSON 백업 파일을 저장했습니다.");
});
$("#pngButton").addEventListener("click", () => {
  if (!latestResult && !runCalculation(false)) return;
  downloadReportPng(latestProject, latestResult);
  toast("공식과 대입값을 포함한 PNG 계산서를 저장했습니다.");
});
$("#pdfButton").addEventListener("click", () => {
  if (!latestResult && !runCalculation(false)) return;
  try {
    downloadReportPdf(latestProject, latestResult);
    toast("공식과 대입값을 포함한 PDF 계산서를 저장했습니다.");
  } catch (error) {
    toast(error.message);
  }
});
$("#printButton").addEventListener("click", () => window.print());

const dialog = $("#helpDialog");
$("#helpButton").addEventListener("click", () => dialog.showModal());
$("[data-close-dialog]").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeButton").setAttribute("aria-label", theme === "dark" ? "밝은 화면으로 전환" : "어두운 화면으로 전환");
}

applyTheme(localStorage.getItem("tankstruct.theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeButton").addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("tankstruct.theme", theme);
  applyTheme(theme);
});

initialize().catch(error => {
  $("#formMessage").textContent = `${error.message} 로컬에서는 python -m http.server 4174로 실행하세요.`;
  $("#formMessage").hidden = false;
});
