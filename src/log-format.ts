export const compactActivityLog = (contents: string) => {
  const compacted = contents
    .replace(/\r\n?/g, '\n')
    .replace(/^[\t ]+|[\t ]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return compacted ? `${compacted}\n` : '';
};
