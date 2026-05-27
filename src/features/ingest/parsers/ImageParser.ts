import type { TFile, Vault } from "obsidian";
import type { ParsedContent } from "../FileParser";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg"
};

export class ImageParser {
  static async parse(file: TFile, vault: Vault): Promise<ParsedContent> {
    const arrayBuffer = await vault.readBinary(file);
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return { type: "image", base64, mimeType: MIME_MAP[file.extension.toLowerCase()] ?? "image/png" };
  }
}