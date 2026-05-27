import type { TFile, Vault } from "obsidian";

export type ParsedContent =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string };

const TEXT_EXTENSIONS = new Set(["md", "txt", "pdf", "doc", "docx", "xlsx", "csv", "pptx"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);

export class FileParser {
  static supports(file: TFile): boolean {
    const ext = file.extension.toLowerCase();
    return TEXT_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
  }

  static async parse(file: TFile, vault: Vault): Promise<ParsedContent> {
    const ext = file.extension.toLowerCase();

    if (IMAGE_EXTENSIONS.has(ext)) {
      const { ImageParser } = await import("./parsers/ImageParser");
      return ImageParser.parse(file, vault);
    }

    if (ext === "md" || ext === "txt") {
      const text = await vault.cachedRead(file);
      const { MdParser } = await import("./parsers/MdParser");
      return { type: "text", text: await MdParser.parse(text) };
    }

    const binary = await vault.readBinary(file);

    if (ext === "pdf") {
      const { PdfParser } = await import("./parsers/PdfParser");
      return { type: "text", text: await PdfParser.parse(binary) };
    }

    if (ext === "doc" || ext === "docx") {
      const { DocxParser } = await import("./parsers/DocxParser");
      return { type: "text", text: await DocxParser.parse(binary, ext) };
    }

    if (ext === "xlsx" || ext === "csv") {
      const { XlsxParser } = await import("./parsers/XlsxParser");
      return { type: "text", text: await XlsxParser.parse(binary) };
    }

    if (ext === "pptx") {
      const { PptxParser } = await import("./parsers/PptxParser");
      return { type: "text", text: await PptxParser.parse(binary) };
    }

    throw new Error(`Unsupported file type: .${ext}`);
  }
}