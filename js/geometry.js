const MM_TO_M = 0.001;

export function mmToM(value) {
  return Number(value) * MM_TO_M;
}

export function geometry(input) {
  const height = mmToM(input.heightMm);
  const fillHeight = mmToM(input.fillHeightMm);

  if (input.shape === "cylinder") {
    const diameter = mmToM(input.diameterMm);
    const planArea = Math.PI * diameter ** 2 / 4;
    return {
      shape: input.shape,
      volumeM3: planArea * fillHeight,
      fullVolumeM3: planArea * height,
      wettedWallAreaM2: Math.PI * diameter * fillHeight,
      fabricationWallAreaM2: Math.PI * diameter * height,
      bottomAreaM2: planArea,
      characteristicWidthM: diameter
    };
  }

  const width = mmToM(input.widthMm);
  const length = mmToM(input.lengthMm);

  if (input.shape === "hopper") {
    const hopperHeight = mmToM(input.hopperHeightMm);
    const straightHeight = Math.max(0, height - hopperHeight);
    const bottomWidth = mmToM(input.bottomWidthMm);
    const bottomLength = mmToM(input.bottomLengthMm);
    const topArea = width * length;
    const bottomArea = bottomWidth * bottomLength;
    const filledStraight = Math.max(0, fillHeight - hopperHeight);
    const filledHopper = Math.min(fillHeight, hopperHeight);
    const hopperRatio = hopperHeight > 0 ? filledHopper / hopperHeight : 0;
    const sectionWidth = bottomWidth + (width - bottomWidth) * hopperRatio;
    const sectionLength = bottomLength + (length - bottomLength) * hopperRatio;
    const sectionArea = sectionWidth * sectionLength;
    const hopperVolume = filledHopper / 3 * (bottomArea + sectionArea + Math.sqrt(bottomArea * sectionArea));
    const fullHopperVolume = hopperHeight / 3 * (bottomArea + topArea + Math.sqrt(bottomArea * topArea));
    const slantWidth = Math.hypot(hopperHeight, (width - bottomWidth) / 2);
    const slantLength = Math.hypot(hopperHeight, (length - bottomLength) / 2);
    const hopperWallArea = (length + bottomLength) * slantWidth + (width + bottomWidth) * slantLength;
    return {
      shape: input.shape,
      volumeM3: hopperVolume + width * length * filledStraight,
      fullVolumeM3: fullHopperVolume + width * length * straightHeight,
      wettedWallAreaM2: hopperWallArea * hopperRatio + 2 * (width + length) * filledStraight,
      fabricationWallAreaM2: hopperWallArea + 2 * (width + length) * straightHeight,
      bottomAreaM2: bottomArea,
      characteristicWidthM: Math.max(width, length),
      straightHeightM: straightHeight,
      hopperHeightM: hopperHeight
    };
  }

  return {
    shape: input.shape,
    volumeM3: width * length * fillHeight,
    fullVolumeM3: width * length * height,
    wettedWallAreaM2: 2 * (width + length) * fillHeight,
    fabricationWallAreaM2: 2 * (width + length) * height,
    bottomAreaM2: width * length,
    characteristicWidthM: Math.max(width, length)
  };
}

export function geometryErrors(input) {
  const errors = [];
  const positive = (key, label) => {
    if (!Number.isFinite(Number(input[key])) || Number(input[key]) <= 0) errors.push({ field: key, message: `${label}은 0보다 커야 합니다.` });
  };
  positive("heightMm", "탱크 높이");
  positive("fillHeightMm", "액체 높이");
  if (Number(input.fillHeightMm) > Number(input.heightMm)) errors.push({ field: "fillHeightMm", message: "액체 높이는 탱크 높이보다 클 수 없습니다." });

  if (input.shape === "cylinder") {
    positive("diameterMm", "내경");
  } else {
    positive("widthMm", "내부 폭");
    positive("lengthMm", "내부 길이");
  }

  if (input.shape === "hopper") {
    positive("hopperHeightMm", "호퍼 높이");
    positive("bottomWidthMm", "하부 폭");
    positive("bottomLengthMm", "하부 길이");
    if (Number(input.hopperHeightMm) > Number(input.heightMm)) errors.push({ field: "hopperHeightMm", message: "호퍼 높이는 전체 높이보다 클 수 없습니다." });
    if (Number(input.bottomWidthMm) >= Number(input.widthMm) || Number(input.bottomLengthMm) >= Number(input.lengthMm)) {
      errors.push({ field: "bottomWidthMm", message: "호퍼 하부 치수는 상부 치수보다 작아야 합니다." });
    }
  }
  return errors;
}
