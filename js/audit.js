const format = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });

const f = value => Number.isFinite(Number(value)) ? format.format(Number(value)) : "-";
const mm = value => Number(value) / 1000;

function row(category, title, formula, substitution, value, unit, basis) {
  return { category, title, formula, substitution, value, unit, basis };
}

function geometryRows(input, result) {
  if (input.shape === "cylinder") {
    const diameterM = mm(input.diameterMm);
    const fillM = mm(input.fillHeightMm);
    return [
      row("형상", "액체 용량", "V = πD²h / 4", `π × ${f(diameterM)}² × ${f(fillM)} / 4`, f(result.geometry.volumeM3), "m³", "사용자 입력"),
      row("형상", "만수 용량", "Vfull = πD²H / 4", `π × ${f(diameterM)}² × ${f(mm(input.heightMm))} / 4`, f(result.geometry.fullVolumeM3), "m³", "사용자 입력")
    ];
  }
  if (input.shape === "hopper") {
    return [
      row("형상", "액체 용량", "V = 직육면체 + 사각뿔대 적분", `W=${f(mm(input.widthMm))}, L=${f(mm(input.lengthMm))}, h=${f(mm(input.fillHeightMm))}`, f(result.geometry.volumeM3), "m³", "첨부 호퍼 공식·형상 함수"),
      row("형상", "만수 용량", "Vfull = 직육면체 + (Hh/3)(A1+A2+√A1A2)", `상부 ${f(input.widthMm)}×${f(input.lengthMm)}, 하부 ${f(input.bottomWidthMm)}×${f(input.bottomLengthMm)} mm`, f(result.geometry.fullVolumeM3), "m³", "첨부 호퍼 공식·형상 함수")
    ];
  }
  return [
    row("형상", "액체 용량", "V = WLh", `${f(mm(input.widthMm))} × ${f(mm(input.lengthMm))} × ${f(mm(input.fillHeightMm))}`, f(result.geometry.volumeM3), "m³", "사용자 입력"),
    row("형상", "만수 용량", "Vfull = WLH", `${f(mm(input.widthMm))} × ${f(mm(input.lengthMm))} × ${f(mm(input.heightMm))}`, f(result.geometry.fullVolumeM3), "m³", "사용자 입력")
  ];
}

export function buildCalculationAudit(project, result) {
  const input = project.input;
  const density = result.hydrostatic.liquidDensityKgM3;
  const fillM = mm(input.fillHeightMm);
  const effectiveMm = Number(input.wallThicknessMm) - Number(input.corrosionAllowanceMm);
  const rows = [
    ...geometryRows(input, result),
    row("하중", "액체 밀도", "ρ = SG × 1,000", `${f(input.specificGravity)} × 1,000`, f(density), "kg/m³", "사용자 입력"),
    row("하중", "바닥 최대 수압", "p = ρgh", `${f(density)} × 9.80665 × ${f(fillM)}`, f(result.hydrostatic.basePressureKpa), "kPa", "정수압 기본식"),
    row("하중", "벽 1 m당 합력", "F = ρgh² / 2", `${f(density)} × 9.80665 × ${f(fillM)}² / 2`, f(result.hydrostatic.resultantForcePerMKn), "kN/m", "삼각 압력분포 적분"),
    row("하중", "합력 작용점", "y = h / 3", `${f(fillM)} / 3`, f(result.hydrostatic.centerOfPressureFromBottomM), "m (바닥 위)", "삼각 압력분포"),
    row("재료", "유효 두께", "te = tnom - c", `${f(input.wallThicknessMm)} - ${f(input.corrosionAllowanceMm)}`, f(effectiveMm), "mm", "사용자 입력"),
    row("재료", "허용응력", "σallow = σref × Kcreep × ηjoint × Ktemp / SF", `${f(result.material.referenceStrengthMpa)} × ${f(result.material.creepFactor)} × ${f(result.material.jointEfficiency)} × ${f(input.temperatureFactor)} / ${f(input.safetyFactor)}`, f(result.material.allowableStressMpa), "MPa", "입력 물성·감소계수")
  ];

  if (input.shape === "cylinder") {
    rows.push(
      row("측판", "둘레응력", "σh = pD / (2te)", `${f(result.hydrostatic.basePressureKpa)} kPa × ${f(mm(input.diameterMm))} / (2 × ${f(effectiveMm)} mm)`, f(result.wall.stressMpa), "MPa", "얇은막 원통"),
      row("측판", "응력 사용률", "Uσ = σh / σallow", `${f(result.wall.stressMpa)} / ${f(result.material.allowableStressMpa)}`, f(result.wall.stressUtilization * 100), "%", "비교값")
    );
  } else {
    rows.push(
      row("측판", "패널 크기", "a = h/(Nh+1), b = Lmax/(Nv+1)", `${f(input.fillHeightMm)}/(${f(input.horizontalRings)}+1), max(W,L)/(${f(input.verticalStiffeners)}+1)`, `${f(result.wall.panelHeightM * 1000)} × ${f(result.wall.panelWidthM * 1000)}`, "mm", "보강 격자"),
      row("측판", "지배 스팬", "s = min(a,b)", `min(${f(result.wall.panelHeightM * 1000)}, ${f(result.wall.panelWidthM * 1000)})`, f(result.wall.governingSpanM * 1000), "mm", "보수적 1방향 스트립"),
      row("측판", "최대 굽힘응력", "σmax = 0.75ps²/te²", `0.75 × ${f(result.hydrostatic.basePressureKpa)} kPa × ${f(result.wall.governingSpanM)}² / ${f(effectiveMm / 1000)}²`, f(result.wall.stressMpa), "MPa", "1방향 단순지지 스트립"),
      row("측판", "최대 변형", "δmax = 5ps⁴/(32Ete³)", `5 × ${f(result.hydrostatic.basePressureKpa)} kPa × ${f(result.wall.governingSpanM)}⁴ / (32 × ${f(result.material.elasticModulusMpa)} MPa × ${f(effectiveMm / 1000)}³)`, f(result.wall.deflectionMm), "mm", "1방향 단순지지 스트립"),
      row("측판", "응력 사용률", "Uσ = σmax / σallow", `${f(result.wall.stressMpa)} / ${f(result.material.allowableStressMpa)}`, f(result.wall.stressUtilization * 100), "%", "비교값"),
      row("측판", "변형 사용률", "Uδ = δmax / δallow", `${f(result.wall.deflectionMm)} / ${f(input.deflectionLimitMm)}`, f(result.wall.deflectionUtilization * 100), "%", "사용자 한도")
    );
  }

  if (result.stiffener) {
    rows.push(
      row("보강재", "수평 보강 요구 Z", "w = pbt, M = wL²/8, Zreq = M/σallow", `w=${f(result.stiffener.horizontalLineLoadNpm)} N/m, L=${f(result.stiffener.horizontalBeamSpanM)} m`, f(result.stiffener.horizontalRequiredSectionModulusCm3), "cm³", "단순지지 보"),
      row("보강재", "수평 보강 사용률", "UZ,h = Zreq / Zactual", `${f(result.stiffener.horizontalRequiredSectionModulusCm3)} / ${f(result.stiffener.horizontalActualSectionModulusCm3)}`, result.stiffener.horizontalUtilization === null ? "미판정" : f(result.stiffener.horizontalUtilization * 100), result.stiffener.horizontalUtilization === null ? "" : "%", "사용자 프로파일"),
      row("보강재", "수직 보강 요구 Z", "w = pbt, M = wL²/8, Zreq = M/σallow", `w=${f(result.stiffener.verticalLineLoadNpm)} N/m, L=${f(result.stiffener.verticalSpanM)} m`, f(result.stiffener.verticalRequiredSectionModulusCm3), "cm³", "단순지지 보"),
      row("보강재", "수직 보강 사용률", "UZ,v = Zreq / Zactual", `${f(result.stiffener.verticalRequiredSectionModulusCm3)} / ${f(result.stiffener.verticalActualSectionModulusCm3)}`, result.stiffener.verticalUtilization === null ? "미판정" : f(result.stiffener.verticalUtilization * 100), result.stiffener.verticalUtilization === null ? "" : "%", "사용자 프로파일")
    );
  }

  rows.push(
    row("중량", "측판 중량", "mwall = Awall × twall × ρmaterial", `${f(result.geometry.fabricationWallAreaM2)} × ${f(mm(input.wallThicknessMm))} × ${f(result.material.densityKgM3)}`, f(result.bom.wallMassKg), "kg", "형상·재료 입력"),
    row("중량", "바닥판 중량", "mbottom = Abottom × tbottom × ρmaterial", `${f(result.geometry.bottomAreaM2)} × ${f(mm(input.bottomThicknessMm))} × ${f(result.material.densityKgM3)}`, f(result.bom.bottomMassKg), "kg", "전면 지지·굽힘 미산정"),
    row("판정", "최대 사용률", "Umax = max(Uσ, Uδ, UZ,h, UZ,v)", "계산된 모든 적용 사용률 중 최댓값", f(result.utilization * 100), "%", "스크리닝 판정")
  );
  return rows;
}
