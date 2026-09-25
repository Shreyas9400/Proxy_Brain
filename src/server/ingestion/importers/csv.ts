import { parse } from "csv-parse/sync";
import type { Importer, ImportedDocument } from "../importer";

// Some exports (e.g. LinkedIn's Connections.csv) prefix the real header with
// a few lines of single-cell preamble text ("Notes: ..."). Skip past any
// leading rows that have at most one non-empty cell rather than mistaking
// them for column headers — a no-op for a CSV that starts with a proper
// multi-column header, which is the common case.
export function findHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const nonEmptyCells = rows[i].filter((cell) => cell.trim().length > 0).length;
    if (nonEmptyCells > 1) return i;
  }
  return 0;
}

export const csvImporter: Importer = {
  extensions: [".csv"],
  async parse(fileName, buffer): Promise<ImportedDocument> {
    const allRows: string[][] = parse(buffer, { skip_empty_lines: true, relax_column_count: true });
    if (allRows.length === 0) {
      return { title: fileName, text: "", metadata: { sizeBytes: buffer.byteLength, rowCount: 0 } };
    }

    const headerIndex = findHeaderIndex(allRows);
    const [header, ...body] = allRows.slice(headerIndex);

    const table = body
      .map((row) => header.map((col, i) => `${col}: ${row[i] ?? ""}`).join(", "))
      .join("\n");

    return {
      title: fileName,
      text: `Columns: ${header.join(", ")}\n\n${table}`,
      metadata: { sizeBytes: buffer.byteLength, rowCount: body.length, columns: header, skippedPreambleRows: headerIndex },
    };
  },
};
