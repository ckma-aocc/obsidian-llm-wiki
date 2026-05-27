export class XlsxParser {
  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      parts.push(`## ${name}\n${csv}`);
    }
    return parts.join("\n\n");
  }
}