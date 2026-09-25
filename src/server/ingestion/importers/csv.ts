import { parse } from "csv-parse/sync";
import type { Importer, ImportedDocument } from "../importer";

export const csvImporter: Importer = {
  extensions: [".csv"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const rows: string[][] = parse(buffer, { skip_empty_lines: true, relax_column_count: true });
    if (rows.length === 0) {
      return { title: fileName, text: "", metadata: { sizeBytes: buffer.byteLength, rowCount: 0 } };
    }

    const [header, ...body] = rows;
    const table = body
      .map((row) => header.map((col, i) => `${col}: ${row[i] ?? ""}`).join(", "))
      .join("\n");

    return {
      title: fileName,
      text: `Columns: ${header.join(", ")}\n\n${table}`,
      metadata: { sizeBytes: buffer.byteLength, rowCount: body.length, columns: header },
    };
  },
};
