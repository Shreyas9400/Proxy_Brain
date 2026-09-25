export interface ImportedDocument {
  title: string;
  text: string;
  metadata: Record<string, unknown>;
}

export interface Importer {
  extensions: string[];
  parse(fileName: string, buffer: Buffer): Promise<ImportedDocument>;
}

const registry = new Map<string, Importer>();

export function registerImporter(importer: Importer) {
  for (const ext of importer.extensions) {
    registry.set(ext.toLowerCase(), importer);
  }
}

export function getImporterForFile(fileName: string): Importer | undefined {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return registry.get(ext);
}

export function supportedExtensions(): string[] {
  return Array.from(registry.keys());
}
