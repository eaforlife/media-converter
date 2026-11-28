export type DetectedCrop = {
  width: number;
  height: number;
  x: number;
  y: number;
  filter: string;
};

export const cropAnalysisDimensions = (width: number, height: number, maximumDimension = 320): [number, number] => {
  if (width <= 0 || height <= 0) return [maximumDimension, maximumDimension];
  const scale = Math.min(1, maximumDimension / Math.max(width, height));
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return [even(width * scale), even(height * scale)];
};

export const cropSampleTimes = (duration: number | null, sampleCount: number) => {
  if (!duration || duration <= 1) return [0];
  const count = Math.max(1, Math.floor(sampleCount));
  if (count === 1) return [duration * 0.5];
  return Array.from({ length: count }, (_item, index) => duration * (0.3 + 0.4 * index / (count - 1)));
};

export const scaleCropFromAnalysis = (
  value: string,
  sourceWidth: number,
  sourceHeight: number,
  analysisWidth: number,
  analysisHeight: number,
) => {
  const crop = value.split(':').map(Number);
  if (crop.length !== 4 || crop.some((part) => !Number.isInteger(part))
    || analysisWidth <= 0 || analysisHeight <= 0) return null;
  const [width, height, x, y] = crop;
  if (width <= 0 || height <= 0 || x < 0 || y < 0
    || x + width > analysisWidth || y + height > analysisHeight) return null;
  const even = (number: number) => Math.max(0, Math.round(number / 2) * 2);
  const left = even(x * sourceWidth / analysisWidth);
  const right = even((analysisWidth - x - width) * sourceWidth / analysisWidth);
  const top = even(y * sourceHeight / analysisHeight);
  const bottom = even((analysisHeight - y - height) * sourceHeight / analysisHeight);
  const scaledWidth = sourceWidth - left - right;
  const scaledHeight = sourceHeight - top - bottom;
  return scaledWidth > 0 && scaledHeight > 0
    ? `${scaledWidth}:${scaledHeight}:${left}:${top}`
    : null;
};

export const cuvidCropMargins = (
  crop: DetectedCrop,
  sourceWidth: number,
  sourceHeight: number,
) => {
  const top = Math.round(crop.y / 2);
  const bottom = Math.round((sourceHeight - crop.height - crop.y) / 2);
  const left = Math.round(crop.x / 2);
  const right = Math.round((sourceWidth - crop.width - crop.x) / 2);
  return `${top}x${bottom}x${left}x${right}`;
};

export const detectedCrop = (
  value: string | null | undefined,
  sourceWidth: number,
  sourceHeight: number,
): DetectedCrop | null => {
  if (!value) return null;
  const crop = value.split(':').map(Number);
  if (crop.length !== 4 || crop.some((part) => !Number.isInteger(part))) return null;
  const [width, height, x, y] = crop;
  if (width <= 0 || height <= 0 || x < 0 || y < 0) return null;
  if (x + width > sourceWidth || y + height > sourceHeight) return null;
  if (x === 0 && y === 0 && width === sourceWidth && height === sourceHeight) return null;
  return { width, height, x, y, filter: `${width}:${height}:${x}:${y}` };
};

export const stableCropConsensus = (
  samples: readonly (string | null)[],
  sourceWidth: number,
  sourceHeight: number,
) => {
  const votes = new Map<string, number>();
  samples.forEach((sample) => {
    const crop = detectedCrop(sample, sourceWidth, sourceHeight);
    if (crop) votes.set(crop.filter, (votes.get(crop.filter) ?? 0) + 1);
  });
  const winner = [...votes.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!winner || winner[1] < Math.floor(samples.length / 2) + 1) return null;
  return winner[0];
};

export const aspectPreservingDimensions = (
  target: readonly [string, string],
  sourceWidth: number,
  sourceHeight: number,
  crop?: DetectedCrop | null,
): [string, string] => {
  if (target[1] !== '-2') return [target[0], target[1]];
  const width = Number(target[0]);
  const aspectWidth = crop?.width ?? sourceWidth;
  const aspectHeight = crop?.height ?? sourceHeight;
  if (!Number.isFinite(width) || width <= 0 || aspectWidth <= 0 || aspectHeight <= 0) return [target[0], '-2'];
  const height = Math.max(2, Math.round((width * aspectHeight / aspectWidth) / 2) * 2);
  return [String(width), String(height)];
};
