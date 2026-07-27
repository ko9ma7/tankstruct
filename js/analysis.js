import { geometry, geometryErrors, mmToM } from "./geometry.js";

const GRAVITY = 9.80665;

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function normalizeMaterial(material, overrides = {}) {
  return {
    ...material,
    densityKgM3: Number(overrides.densityKgM3 ?? material.densityKgM3),
    elasticModulusMpa: Number(overrides.elasticModulusMpa ?? material.elasticModulusMpa),
    referenceStrengthMpa: Number(overrides.referenceStrengthMpa ?? material.referenceStrengthMpa),
    creepFactor: Number(overrides.creepFactor ?? material.creepFactor),
    jointEfficiency: Number(overrides.jointEfficiency ?? material.jointEfficiency)
  };
}

export function inputErrors(input, material) {
  const errors = geometryErrors(input);
  const checks = [
    ["specificGravity", "액체 비중", 0.1, 3],
    ["temperatureC", "설계온도", -30, 250],
    ["safetyFactor", "목표 안전계수", 1.1, 6],
    ["deflectionLimitMm", "허용 변형", 0.1, 100],
    ["wallThicknessMm", "검토 두께", 0.5, 100],
    ["bottomThicknessMm", "바닥판 두께", 0.5, 100],
    ["corrosionAllowanceMm", "부식·가공 여유", 0, 20],
    ["temperatureFactor", "온도 감소계수", 0.05, 1],
    ["horizontalSectionModulusCm3", "수평 보강재 실제 단면계수", 0, 100000],
    ["verticalSectionModulusCm3", "수직 보강재 실제 단면계수", 0, 100000]
  ];
  for (const [key, label, min, max] of checks) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) errors.push({ field: key, message: `${label}은 ${min}~${max} 범위로 입력하세요.` });
  }
  if (Number(input.corrosionAllowanceMm) >= Number(input.wallThicknessMm)) {
    errors.push({ field: "corrosionAllowanceMm", message: "부식·가공 여유는 검토 두께보다 작아야 합니다." });
  }
  if (!material || material.elasticModulusMpa <= 0 || material.referenceStrengthMpa <= 0) {
    errors.push({ field: "materialId", message: "재료 물성값을 확인하세요." });
  }
  if (input.shape !== "cylinder" && !input.topFrame) {
    errors.push({ field: "topFrame", message: "현재 사각 패널 모델은 연속 상부 프레임이 있어야 적용할 수 있습니다." });
  }
  return errors;
}

export function allowableStressMpa(input, material) {
  return material.referenceStrengthMpa
    * material.creepFactor
    * material.jointEfficiency
    * Number(input.temperatureFactor)
    / Number(input.safetyFactor);
}

function rectangularPanel(input, material, pressurePa, allowableMpa) {
  const heightM = mmToM(input.fillHeightMm);
  const wallWidthM = Math.max(mmToM(input.widthMm), mmToM(input.lengthMm));
  const horizontalPanels = Math.max(1, Number(input.horizontalRings) + 1);
  const verticalPanels = Math.max(1, Number(input.verticalStiffeners) + 1);
  const panelHeightM = heightM / horizontalPanels;
  const panelWidthM = wallWidthM / verticalPanels;
  const governingSpanM = Math.min(panelHeightM, panelWidthM);
  const effectiveThicknessM = mmToM(input.wallThicknessMm - input.corrosionAllowanceMm);
  const elasticModulusPa = material.elasticModulusMpa * 1e6;

  // One-way simply-supported strip under the maximum pressure in the panel.
  // This intentionally ignores beneficial two-way plate action, so it is a screening approximation.
  const stressPa = 0.75 * pressurePa * governingSpanM ** 2 / effectiveThicknessM ** 2;
  const deflectionM = 5 * pressurePa * governingSpanM ** 4 / (32 * elasticModulusPa * effectiveThicknessM ** 3);

  return {
    model: "사각 격자 패널의 1방향 단순지지 스트립 근사",
    panelHeightM,
    panelWidthM,
    governingSpanM,
    effectiveThicknessM,
    stressMpa: stressPa / 1e6,
    deflectionMm: deflectionM * 1000,
    stressUtilization: (stressPa / 1e6) / allowableMpa,
    deflectionUtilization: deflectionM * 1000 / Number(input.deflectionLimitMm)
  };
}

function cylindricalShell(input, pressurePa, allowableMpa) {
  const diameterM = mmToM(input.diameterMm);
  const effectiveThicknessM = mmToM(input.wallThicknessMm - input.corrosionAllowanceMm);
  const hoopStressMpa = pressurePa * diameterM / (2 * effectiveThicknessM) / 1e6;
  const thinWallRatio = effectiveThicknessM / diameterM;
  return {
    model: "개방 원통의 바닥 수압 기준 얇은막 둘레응력",
    stressMpa: hoopStressMpa,
    deflectionMm: null,
    stressUtilization: hoopStressMpa / allowableMpa,
    deflectionUtilization: null,
    effectiveThicknessM,
    thinWallRatio
  };
}

function stiffenerDemand(input, allowableMpa, pressurePa) {
  if (input.shape === "cylinder") return null;
  const heightM = mmToM(input.fillHeightMm);
  const longWallM = mmToM(input.lengthMm);
  const shortWallM = mmToM(input.widthMm);
  const hPanels = Number(input.horizontalRings) + 1;
  const vPanels = Number(input.verticalStiffeners) + 1;
  const tributaryHeightM = heightM / hPanels;
  const sections = [];
  for (const wallSpanM of [longWallM, shortWallM]) {
    const beamSpanM = wallSpanM / vPanels;
    const lineLoadNpm = pressurePa * tributaryHeightM;
    const momentNm = lineLoadNpm * beamSpanM ** 2 / 8;
    sections.push(momentNm / (allowableMpa * 1e6) * 1e6);
  }
  const horizontalZcm3 = Math.max(...sections);
  const verticalTributaryM = Math.max(longWallM, shortWallM) / vPanels;
  const verticalSpanM = heightM / hPanels;
  const verticalLineLoadNpm = pressurePa * verticalTributaryM;
  const verticalMomentNm = verticalLineLoadNpm * verticalSpanM ** 2 / 8;
  const verticalZcm3 = verticalMomentNm / (allowableMpa * 1e6) * 1e6;
  const horizontalActualZcm3 = Number(input.horizontalSectionModulusCm3) || 0;
  const verticalActualZcm3 = Number(input.verticalSectionModulusCm3) || 0;
  return {
    horizontalRequiredSectionModulusCm3: horizontalZcm3,
    verticalRequiredSectionModulusCm3: verticalZcm3,
    horizontalActualSectionModulusCm3: horizontalActualZcm3,
    verticalActualSectionModulusCm3: verticalActualZcm3,
    horizontalUtilization: horizontalActualZcm3 > 0 ? horizontalZcm3 / horizontalActualZcm3 : null,
    verticalUtilization: verticalActualZcm3 > 0 ? verticalZcm3 / verticalActualZcm3 : null,
    horizontalLineLoadNpm: pressurePa * tributaryHeightM,
    horizontalMomentNm: Math.max(...sections) * allowableMpa,
    horizontalTributaryHeightM: tributaryHeightM,
    horizontalBeamSpanM: Math.max(longWallM, shortWallM) / vPanels,
    verticalLineLoadNpm,
    verticalMomentNm,
    verticalTributaryM,
    verticalSpanM,
    note: "각 보강재를 단순지지 보로 보고 바닥 최대 수압을 전 구간에 적용한 요구 단면계수입니다. 실제 프로파일·용접부·코너 접합은 별도 검토해야 합니다."
  };
}

function billOfMaterials(input, material, geom, stiffener) {
  const wallThicknessM = mmToM(input.wallThicknessMm);
  const bottomThicknessM = mmToM(input.bottomThicknessMm);
  const plateAreaM2 = geom.fabricationWallAreaM2 + geom.bottomAreaM2;
  const wallMassKg = geom.fabricationWallAreaM2 * wallThicknessM * material.densityKgM3;
  const bottomMassKg = geom.bottomAreaM2 * bottomThicknessM * material.densityKgM3;
  const plateMassKg = wallMassKg + bottomMassKg;
  const items = [
    { item: "측판", specification: `${input.wallThicknessMm} mm`, quantity: round(geom.fabricationWallAreaM2, 2), unit: "m²" },
    { item: "바닥판", specification: `${input.bottomThicknessMm} mm · 전면 지지 가정`, quantity: round(geom.bottomAreaM2, 2), unit: "m²" }
  ];

  if (input.shape !== "cylinder") {
    const perimeterM = 2 * (mmToM(input.widthMm) + mmToM(input.lengthMm));
    const verticalLengthM = 2 * (Number(input.verticalStiffeners) * 2) * mmToM(input.heightMm);
    if (Number(input.horizontalRings) > 0) {
      items.push({
        item: "수평 보강재",
        specification: `Z요구 ${round(stiffener.horizontalRequiredSectionModulusCm3, 2)} / 입력 ${round(stiffener.horizontalActualSectionModulusCm3, 2)} cm³`,
        quantity: round(perimeterM * Number(input.horizontalRings), 2),
        unit: "m"
      });
    }
    if (Number(input.verticalStiffeners) > 0) {
      items.push({
        item: "수직 보강재",
        specification: `Z요구 ${round(stiffener.verticalRequiredSectionModulusCm3, 2)} / 입력 ${round(stiffener.verticalActualSectionModulusCm3, 2)} cm³`,
        quantity: round(verticalLengthM, 2),
        unit: "m"
      });
    }
    items.push({ item: "연속 상부 프레임", specification: "프로파일·코너 용접 별도 검토", quantity: round(perimeterM, 2), unit: "m" });
  }

  return { items, plateAreaM2, plateMassKg, wallMassKg, bottomMassKg };
}

function confidence(input, material) {
  let score = 3;
  const reasons = [];
  if (material.group === "thermoplastic") {
    score -= 1;
    reasons.push("열가소성 수지는 장기 크리프와 약품 영향 자료가 필요합니다.");
  }
  if (input.shape === "hopper") {
    score -= 1;
    reasons.push("호퍼 경사판·전이부·배출구의 국부응력은 계산하지 않습니다.");
  }
  if (Number(input.temperatureFactor) === 1 && Number(input.temperatureC) !== 20) {
    score -= 1;
    reasons.push("설계온도에 맞는 물성 감소계수가 확인되지 않았습니다.");
  }
  if (material.sourceQuality === "user") reasons.push("사용자 입력 물성의 출처 확인이 필요합니다.");
  return {
    level: score >= 3 ? "중간" : score === 2 ? "낮음" : "매우 낮음",
    reasons
  };
}

export function analyzeTank(input, material) {
  const errors = inputErrors(input, material);
  if (errors.length) return { errors };

  const geom = geometry(input);
  const densityKgM3 = Number(input.specificGravity) * 1000;
  const fillHeightM = mmToM(input.fillHeightMm);
  const pressurePa = densityKgM3 * GRAVITY * fillHeightM;
  const resultantForcePerM = 0.5 * densityKgM3 * GRAVITY * fillHeightM ** 2;
  const allowableMpa = allowableStressMpa(input, material);
  const structuralShape = input.shape === "hopper" ? "rectangular" : input.shape;
  const panelInput = { ...input, shape: structuralShape };
  const wall = structuralShape === "cylinder"
    ? cylindricalShell(panelInput, pressurePa, allowableMpa)
    : rectangularPanel(panelInput, material, pressurePa, allowableMpa);
  const stiffener = stiffenerDemand(panelInput, allowableMpa, pressurePa);
  const bom = billOfMaterials(input, material, geom, stiffener);
  const utilization = Math.max(
    wall.stressUtilization,
    wall.deflectionUtilization ?? 0,
    stiffener?.horizontalUtilization ?? 0,
    stiffener?.verticalUtilization ?? 0
  );
  const warnings = [];

  if (input.shape === "hopper") warnings.push("호퍼는 용량과 수직 측판만 검토합니다. 경사판, 절곡·용접 전이부, 배출구, 지지 다리는 구조 판정에서 제외됩니다.");
  if (material.group === "thermoplastic") warnings.push("PP 결과는 단기 물성에 내부 장기감소계수를 적용한 스크리닝입니다. 설계수명·온도·약품별 크리프 자료가 없으면 제작 승인에 사용할 수 없습니다.");
  if (wall.deflectionMm !== null && wall.deflectionMm > Number(input.deflectionLimitMm)) warnings.push("예상 변형이 입력한 한도를 넘습니다. 판 두께 또는 보강 격자를 늘려 다시 비교하세요.");
  if (wall.stressUtilization > 1) warnings.push("계산 응력이 목표 안전계수를 반영한 허용응력을 넘습니다.");
  if (stiffener && Number(input.horizontalRings) > 0 && !stiffener.horizontalActualSectionModulusCm3) warnings.push("수평 보강재의 실제 단면계수 Z가 입력되지 않아 보강재 적합 여부를 판정할 수 없습니다.");
  if (stiffener && Number(input.verticalStiffeners) > 0 && !stiffener.verticalActualSectionModulusCm3) warnings.push("수직 보강재의 실제 단면계수 Z가 입력되지 않아 보강재 적합 여부를 판정할 수 없습니다.");
  if ((stiffener?.horizontalUtilization ?? 0) > 1 || (stiffener?.verticalUtilization ?? 0) > 1) warnings.push("입력한 보강재 단면계수가 요구값보다 작습니다. 프로파일 또는 배치를 변경하세요.");
  if (input.closedTank) warnings.push("밀폐·가압 조건은 이 도구의 범위 밖입니다. 압력용기 적용 규격으로 별도 설계해야 합니다.");
  if (input.supportType !== "full-base") warnings.push("전면 지지 기초가 아닌 조건은 바닥판·지지부·국부응력을 별도 구조해석해야 합니다.");
  if (input.externalLoads) warnings.push("풍하중·지진·운반·충격 등 외력이 있으므로 이 정수압 단독 모델로 통과 판정을 내리지 않습니다.");
  if (input.attachedEquipment) warnings.push("노즐·교반기·배관·플랫폼 등 부착물 하중은 모델에 포함되지 않았습니다.");

  const missingStiffenerData = Boolean(stiffener) && (
    (Number(input.horizontalRings) > 0 && !stiffener.horizontalActualSectionModulusCm3)
    || (Number(input.verticalStiffeners) > 0 && !stiffener.verticalActualSectionModulusCm3)
  );
  const withinScope = !input.closedTank
    && input.shape !== "hopper"
    && input.supportType === "full-base"
    && !input.externalLoads
    && !input.attachedEquipment
    && !missingStiffenerData;

  return {
    errors: [],
    status: utilization <= 1 && withinScope ? "screen-pass" : "review",
    geometry: geom,
    hydrostatic: {
      liquidDensityKgM3: densityKgM3,
      basePressureKpa: pressurePa / 1000,
      resultantForcePerMKn: resultantForcePerM / 1000,
      centerOfPressureFromBottomM: fillHeightM / 3
    },
    material: {
      ...material,
      allowableStressMpa: allowableMpa
    },
    wall,
    stiffener,
    bom,
    utilization,
    confidence: confidence(input, material),
    warnings,
    assumptions: [
      "대기와 통하는 상압 탱크이며 액체 정수압만 작용합니다.",
      "사각 탱크는 바닥·코너·연속 상부 프레임과 입력한 보강재가 패널 가장자리를 지지한다고 가정합니다.",
      "지진, 풍하중, 운반, 노즐 하중, 교반기, 진공, 열구배, 용접 잔류응력, 좌굴, 기초 침하는 제외합니다.",
      "보강재 요구 단면계수는 프로파일 선정 전의 1차 값이며 용접부와 국부좌굴을 포함하지 않습니다.",
      "바닥판은 전면 지지되는 평탄하고 강성 있는 기초를 가정하며 별도 굽힘 계산을 하지 않습니다."
    ]
  };
}
