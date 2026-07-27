import { analyzeTank } from "./analysis.js";

function identity(candidate) {
  return `${candidate.input.wallThicknessMm}-${candidate.input.horizontalRings}-${candidate.input.verticalStiffeners}`;
}

export function optimizeTank(baseInput, material) {
  if (baseInput.closedTank) return [];
  const isCylinder = baseInput.shape === "cylinder";
  const candidates = [];

  for (const thickness of material.standardThicknessesMm) {
    const horizontalMax = isCylinder ? 0 : 4;
    const verticalMax = isCylinder ? 0 : 3;
    for (let horizontalRings = 0; horizontalRings <= horizontalMax; horizontalRings += 1) {
      for (let verticalStiffeners = 0; verticalStiffeners <= verticalMax; verticalStiffeners += 1) {
        const input = { ...baseInput, wallThicknessMm: thickness, horizontalRings, verticalStiffeners };
        const result = analyzeTank(input, material);
        if (result.errors.length || result.status !== "screen-pass") continue;
        const complexity = horizontalRings + verticalStiffeners;
        candidates.push({
          input,
          result,
          complexity,
          plateMassKg: result.bom.plateMassKg,
          balancedScore: result.bom.plateMassKg * (1 + complexity * 0.035) + complexity * 12
        });
      }
    }
  }

  if (!candidates.length) return [];
  const selections = [
    { strategy: "균형안", candidate: [...candidates].sort((a, b) => a.balancedScore - b.balancedScore)[0] },
    { strategy: "제작 단순안", candidate: [...candidates].sort((a, b) => a.complexity - b.complexity || a.plateMassKg - b.plateMassKg)[0] },
    { strategy: "판재 경량안", candidate: [...candidates].sort((a, b) => a.plateMassKg - b.plateMassKg || a.complexity - b.complexity)[0] }
  ];
  const seen = new Set();
  return selections.filter(({ candidate }) => {
    const key = identity(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
