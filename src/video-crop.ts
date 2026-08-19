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
  const top = Math.floor(crop.y / 2);
  const bottom = Math.floor((sourceHeight - crop.height - crop.y) / 2);
  const left = Math.floor(crop.x / 2);
  const right = Math.floor((sourceWidth - crop.width - crop.x) / 2);
  return top || bottom || left || right ? `${top}x${bottom}x${left}x${right}` : null;
};
