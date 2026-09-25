import { PDFParse } from "pdf-parse";
import type { Importer, ImportedDocument } from "../importer";

export const pdfImporter: Importer = {
  extensions: [".pdf"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const info = await parser.getInfo().catch(() => undefined);
      const pdfTitle = info?.info && typeof info.info === "object" ? (info.info as Record<string, unknown>).Title : undefined;
      return {
        title: typeof pdfTitle === "string" && pdfTitle.trim() ? pdfTitle : fileName,
        text: result.text,
        metadata: { sizeBytes: buffer.byteLength, pages: result.pages.length },
      };
    } finally {
      await parser.destroy();
    }
  },
};
