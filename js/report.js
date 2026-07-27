import { buildCalculationAudit } from "./audit.js";

const safeName = value => (value || "탱크_검토").replace(/[\\/:*?"<>|]+/g, "_").trim() || "탱크_검토";
const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });

function wrapText(context, text, maxWidth) {
  const words = String(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(context, text, x, y, maxWidth, lineHeight = 30) {
  const lines = wrapText(context, text, maxWidth);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function inputSummary(project, result) {
  const input = project.input;
  const dimensions = input.shape === "cylinder"
    ? `내경 ${nf.format(input.diameterMm)} × 높이 ${nf.format(input.heightMm)} mm`
    : `폭 ${nf.format(input.widthMm)} × 길이 ${nf.format(input.lengthMm)} × 높이 ${nf.format(input.heightMm)} mm`;
  return [
    ["형상·치수", `${input.shape} · ${dimensions}`],
    ["액체", `비중 ${nf.format(input.specificGravity)} · 액높이 ${nf.format(input.fillHeightMm)} mm · ${nf.format(input.temperatureC)} °C`],
    ["재료", `${result.material.name} · E ${nf.format(result.material.elasticModulusMpa)} MPa · 기준강도 ${nf.format(result.material.referenceStrengthMpa)} MPa`],
    ["판·보강", `측판 ${nf.format(input.wallThicknessMm)} mm · 바닥 ${nf.format(input.bottomThicknessMm)} mm · 수평 ${nf.format(input.horizontalRings)}줄 / Z ${nf.format(input.horizontalSectionModulusCm3)} cm³ · 수직 ${nf.format(input.verticalStiffeners)}개/면 / Z ${nf.format(input.verticalSectionModulusCm3)} cm³`],
    ["적용 조건", `안전계수 ${nf.format(input.safetyFactor)} · 변형한도 ${nf.format(input.deflectionLimitMm)} mm · 지지 ${input.supportType}`]
  ];
}

export function createReportCanvas(project, result) {
  const audit = buildCalculationAudit(project, result);
  const width = 1400;
  const rowHeights = audit.map(item => {
    const roughLines = Math.max(
      Math.ceil((item.formula.length + item.title.length) / 55),
      Math.ceil((item.substitution.length + String(item.value).length) / 70)
    );
    return Math.max(100, 58 + roughLines * 26);
  });
  const height = 780 + rowHeights.reduce((sum, value) => sum + value, 0) + Math.max(360, result.warnings.length * 70);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#0f172a";
  context.fillRect(0, 0, width, 250);
  context.fillStyle = "#38bdf8";
  context.font = "700 24px 'Malgun Gothic', sans-serif";
  context.fillText("TANKSTRUCT · RE-CHECKABLE CALCULATION REPORT", 70, 68);
  context.fillStyle = "#ffffff";
  context.font = "700 48px 'Malgun Gothic', sans-serif";
  context.fillText(project.name, 70, 132);
  context.font = "400 23px 'Malgun Gothic', sans-serif";
  context.fillStyle = "#cbd5e1";
  context.fillText(`v0.2.0 · ${new Date().toLocaleString("ko-KR")} · ${result.status === "screen-pass" ? "목표 조건 이내" : "추가 검토 필요"}`, 70, 184);
  context.fillStyle = result.status === "screen-pass" ? "#22c55e" : "#f59e0b";
  context.fillRect(1110, 58, 220, 72);
  context.fillStyle = "#07111f";
  context.font = "700 25px 'Malgun Gothic', sans-serif";
  context.textAlign = "center";
  context.fillText(result.status === "screen-pass" ? "SCREEN PASS" : "REVIEW", 1220, 103);
  context.textAlign = "left";

  let y = 300;
  context.fillStyle = "#0f172a";
  context.font = "700 30px 'Malgun Gothic', sans-serif";
  context.fillText("입력 조건", 70, y);
  y += 42;
  for (const [label, value] of inputSummary(project, result)) {
    context.fillStyle = "#e2e8f0";
    context.fillRect(70, y, 220, 48);
    context.fillStyle = "#334155";
    context.font = "700 20px 'Malgun Gothic', sans-serif";
    context.fillText(label, 90, y + 31);
    context.fillStyle = "#ffffff";
    context.fillRect(290, y, 1040, 48);
    context.fillStyle = "#0f172a";
    context.font = "400 19px 'Malgun Gothic', sans-serif";
    context.fillText(value, 312, y + 31);
    y += 52;
  }

  y += 35;
  context.fillStyle = "#0f172a";
  context.font = "700 30px 'Malgun Gothic', sans-serif";
  context.fillText("공식 · 입력값 대입 · 결과", 70, y);
  y += 34;
  audit.forEach((item, index) => {
    const rowHeight = rowHeights[index];
    context.fillStyle = index % 2 ? "#ffffff" : "#f1f5f9";
    context.fillRect(70, y, 1260, rowHeight);
    context.fillStyle = "#2563eb";
    context.font = "700 17px 'Malgun Gothic', sans-serif";
    context.fillText(item.category, 92, y + 30);
    context.fillStyle = "#0f172a";
    context.font = "700 21px 'Malgun Gothic', sans-serif";
    context.fillText(item.title, 210, y + 30);
    context.fillStyle = "#1e3a8a";
    context.font = "600 19px 'Malgun Gothic', monospace";
    let textY = drawText(context, item.formula, 210, y + 61, 1080, 26);
    context.fillStyle = "#475569";
    context.font = "400 18px 'Malgun Gothic', sans-serif";
    textY = drawText(context, `대입: ${item.substitution}`, 210, textY + 3, 760, 25);
    context.fillStyle = "#0f172a";
    context.font = "700 20px 'Malgun Gothic', sans-serif";
    context.fillText(`결과: ${item.value} ${item.unit}`, 990, y + 62);
    context.fillStyle = "#64748b";
    context.font = "400 16px 'Malgun Gothic', sans-serif";
    context.fillText(`근거: ${item.basis}`, 990, y + 91);
    y += rowHeight;
  });

  y += 45;
  context.fillStyle = "#0f172a";
  context.font = "700 30px 'Malgun Gothic', sans-serif";
  context.fillText("주의·전문 검토 항목", 70, y);
  y += 42;
  context.font = "400 19px 'Malgun Gothic', sans-serif";
  for (const warning of result.warnings) {
    context.fillStyle = "#fef3c7";
    const lines = wrapText(context, warning, 1170);
    const boxHeight = Math.max(52, lines.length * 27 + 20);
    context.fillRect(70, y, 1260, boxHeight);
    context.fillStyle = "#92400e";
    lines.forEach((line, index) => context.fillText(`• ${line}`, 95, y + 32 + index * 27));
    y += boxHeight + 8;
  }
  context.fillStyle = "#475569";
  context.font = "400 17px 'Malgun Gothic', sans-serif";
  drawText(context, "본 계산서는 상압 액체 저장탱크의 개념·견적 단계 비교용입니다. 적용 규격에 따른 설계 계산서, FEA, 제작 승인 또는 검사 성적서를 대체하지 않습니다.", 70, y + 35, 1260, 26);
  return canvas;
}

function triggerDownload(url, filename) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
}

export function downloadReportPng(project, result) {
  const canvas = createReportCanvas(project, result);
  triggerDownload(canvas.toDataURL("image/png"), `${safeName(project.name)}_계산서.png`);
}

export function downloadReportPdf(project, result) {
  const JsPdf = window.jspdf?.jsPDF;
  if (!JsPdf) throw new Error("PDF 모듈을 불러오지 못했습니다.");
  const source = createReportCanvas(project, result);
  const pdf = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 8;
  const imageWidth = pageWidth - margin * 2;
  const sourcePageHeight = Math.floor(source.width * ((pageHeight - margin * 2) / imageWidth));

  for (let sourceY = 0, page = 0; sourceY < source.height; sourceY += sourcePageHeight, page += 1) {
    const sliceHeight = Math.min(sourcePageHeight, source.height - sourceY);
    const slice = document.createElement("canvas");
    slice.width = source.width;
    slice.height = sliceHeight;
    slice.getContext("2d").drawImage(source, 0, sourceY, source.width, sliceHeight, 0, 0, source.width, sliceHeight);
    if (page > 0) pdf.addPage();
    const imageHeight = sliceHeight * imageWidth / source.width;
    pdf.addImage(slice, "PNG", margin, margin, imageWidth, imageHeight, undefined, "FAST");
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(`${page + 1}`, pageWidth / 2, pageHeight - 3, { align: "center" });
  }
  pdf.save(`${safeName(project.name)}_계산서.pdf`);
}
