export class PptxParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const raw = decoder.decode(bytes);
    // PPTX is a zip container; this fallback keeps printable text chunks for lightweight extraction.
    return raw
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}