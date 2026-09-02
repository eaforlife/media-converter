export const AUDIO_INSPECTION_LIMIT = 12;
export const FILE_INDEX_LIMIT = 32;

export const inspectionConcurrency = (
  fileCount: number,
  audioOnly: boolean,
  availableParallelism: number,
) => {
  if (fileCount <= 0) return 0;
  if (!audioOnly) return Math.min(2, fileCount);
  const boundedParallelism = Math.max(2, Math.min(AUDIO_INSPECTION_LIMIT, Math.floor(availableParallelism) || 2));
  return Math.min(fileCount, boundedParallelism);
};

export const boundedMap = async <Input, Output>(
  items: readonly Input[],
  concurrency: number,
  map: (item: Input, index: number) => Promise<Output>,
  onProgress?: (completed: number, total: number, item: Input) => void,
) => {
  const output = new Array<Output>(items.length);
  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await map(items[index], index);
      completed += 1;
      onProgress?.(completed, items.length, items[index]);
    }
  };
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return output;
};
