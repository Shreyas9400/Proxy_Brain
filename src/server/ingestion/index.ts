import { registerImporter, getImporterForFile, supportedExtensions } from "./importer";
import { txtImporter } from "./importers/txt";
import { markdownImporter } from "./importers/markdown";
import { pdfImporter } from "./importers/pdf";
import { jsonImporter } from "./importers/json";
import { csvImporter } from "./importers/csv";

let registered = false;

export function ensureImportersRegistered() {
  if (registered) return;
  registerImporter(txtImporter);
  registerImporter(markdownImporter);
  registerImporter(pdfImporter);
  registerImporter(jsonImporter);
  registerImporter(csvImporter);
  registered = true;
}

export { getImporterForFile, supportedExtensions };
export type { ImportedDocument, Importer } from "./importer";
