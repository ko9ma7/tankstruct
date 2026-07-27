function safeName(value) {
  return (value || "탱크_검토").replace(/[\\/:*?"<>|]+/g, "_").trim() || "탱크_검토";
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadProject(project) {
  download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json;charset=utf-8" }), `${safeName(project.name)}.tank.json`);
}

export function downloadResultCsv(project, result) {
  const rows = [
    ["구분", "항목", "값", "단위"],
    ["입력", "프로젝트", project.name, ""],
    ["입력", "형상", project.input.shape, ""],
    ["입력", "재료", result.material.name, ""],
    ["입력", "검토 두께", project.input.wallThicknessMm, "mm"],
    ["입력", "수평 보강 줄", project.input.horizontalRings, "줄"],
    ["입력", "면당 수직 보강", project.input.verticalStiffeners, "개"],
    ["결과", "용량", (result.geometry.volumeM3 * 1000).toFixed(2), "L"],
    ["결과", "바닥 최대 수압", result.hydrostatic.basePressureKpa.toFixed(3), "kPa"],
    ["결과", "계산 응력", result.wall.stressMpa.toFixed(3), "MPa"],
    ["결과", "허용 응력", result.material.allowableStressMpa.toFixed(3), "MPa"],
    ["결과", "응력 사용률", (result.wall.stressUtilization * 100).toFixed(1), "%"],
    ["결과", "예상 변형", result.wall.deflectionMm?.toFixed(3) ?? "해당 없음", "mm"],
    ["결과", "스크리닝 상태", result.status, ""],
    ...buildCalculationAudit(project, result).map(item => [
      `계산식:${item.category}`,
      `${item.title} | ${item.formula} | 대입 ${item.substitution}`,
      item.value,
      item.unit
    ]),
    ["주의", "용도", "개념·견적 단계의 비교용이며 제작 승인서가 아님", ""]
  ];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  download(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), `${safeName(project.name)}_결과.csv`);
}

export async function readProjectFile(file) {
  if (!file) throw new Error("불러올 JSON 파일을 선택하세요.");
  const data = JSON.parse(await file.text());
  if (![1, 2].includes(data.schemaVersion) || !data.input) throw new Error("지원하지 않는 프로젝트 파일입니다.");
  if (data.schemaVersion === 1) {
    return {
      ...data,
      schemaVersion: 2,
      appVersion: "0.2.0",
      input: {
        bottomThicknessMm: data.input.wallThicknessMm,
        horizontalSectionModulusCm3: 0,
        verticalSectionModulusCm3: 0,
        supportType: "full-base",
        externalLoads: false,
        attachedEquipment: false,
        ...data.input
      }
    };
  }
  return data;
}
import { buildCalculationAudit } from "./audit.js";
