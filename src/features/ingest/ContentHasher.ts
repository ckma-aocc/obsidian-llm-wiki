export class ContentHasher {
  static async hash(content: string): Promise<string> {
    const encoded = new TextEncoder().encode(content);
    const buffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  }
}