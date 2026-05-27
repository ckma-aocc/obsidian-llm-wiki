export class DocxParser {
  static async parse(arrayBuffer: ArrayBuffer, ext: "doc" | "docx" = "docx"): Promise<string> {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      if (ext === "doc") {
        throw new Error(
          "Legacy .doc parsing is limited. Please open the file in Word and save as .docx, then ingest again."
        );
      }
      throw error;
    }
  }
}