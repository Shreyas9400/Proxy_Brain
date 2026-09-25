import type { Importer, ImportedDocument } from "../importer";

export const markdownImporter: Importer = {
  extensions: [".md", ".markdown"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const text = buffer.toString("utf-8");
    const headingMatch = text.match(/^#\s+(.+)$/m);
    return {
      title: headingMatch?.[1]?.trim() ?? fileName,
      text,
      metadata: { sizeBytes: buffer.byteLength },
    };
  },
};
