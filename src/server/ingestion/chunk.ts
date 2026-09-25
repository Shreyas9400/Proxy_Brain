/** Naive fixed-size chunking, good enough for Phase 1 source embedding. */
export function chunkText(text: string, maxChars = 2000): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];

  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += maxChars) {
    chunks.push(trimmed.slice(i, i + maxChars));
  }
  return chunks;
}
