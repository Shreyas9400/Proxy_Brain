import type { Importer, ImportedDocument } from "../importer";

export const txtImporter: Importer = {
  extensions: [".txt"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    return {
      title: fileName,
      text: buffer.toString("utf-8"),
      metadata: { sizeBytes: buffer.byteLength },
    };
  },
};
