import type { Importer, ImportedDocument } from "../importer";

export const jsonImporter: Importer = {
  extensions: [".json"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const raw = buffer.toString("utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Invalid JSON in ${fileName}: ${(err as Error).message}`);
    }

    return {
      title: fileName,
      text: JSON.stringify(parsed, null, 2),
      metadata: {
        sizeBytes: buffer.byteLength,
        topLevelType: Array.isArray(parsed) ? "array" : typeof parsed,
      },
    };
  },
};
