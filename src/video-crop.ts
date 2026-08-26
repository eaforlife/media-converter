export type DetectedCrop = {
  width: number;
  height: number;
  x: number;
  y: number;
  filter: string;
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
  if (x === 0 && y === 0) return null;
  return { width, height, x, y, filter: `${width}:${height}:${x}:${y}` };
};

export const cuvidCrop = (crop: DetectedCrop, sourceWidth: number, sourceHeight: number) => {
  const top = crop.y;
  const bottom = sourceHeight - crop.height - crop.y;
  const left = crop.x;
  const right = sourceWidth - crop.width - crop.x;
  return top || bottom || left || right ? `${top}x${bottom}x${left}x${right}` : null;
};

export const qsvCropOptions = (crop: DetectedCrop) => [
  `cw=${crop.width}`, `ch=${crop.height}`, `cx=${crop.x}`, `cy=${crop.y}`,
];

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
