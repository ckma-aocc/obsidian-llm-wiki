export class PdfParser {
  private static async readAllPages(doc: any): Promise<string> {
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((x: any) => x.str ?? "").join(" "));
    }
    return pages.join("\n\n");
  }

  private static cloneBytes(src: ArrayBuffer): Uint8Array {
    // pdf.js may transfer/"detach" the input buffer when worker parsing starts.
    // Always pass a fresh clone so fallback retries don't reuse detached memory.
    return new Uint8Array(src.slice(0));
  }

  static async parse(arrayBuffer: ArrayBuffer): Promise<string> {
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as any;

    // In Obsidian plugin runtime, worker path resolution may fail.
    // Prefer explicit workerSrc and fallback to fake worker bootstrap.
    if (!pdfjs.GlobalWorkerOptions?.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs";
    }

    try {
      const firstAttemptBytes = this.cloneBytes(arrayBuffer);
      const doc = await pdfjs.getDocument({ data: firstAttemptBytes }).promise;
      return await this.readAllPages(doc);
    } catch (error) {
      // Fallback path: register fake worker module and retry once.
      if (!(globalThis as any).pdfjsWorker) {
        const workerModulePath = "pdfjs-dist/legacy/build/pdf.worker.mjs";
        (globalThis as any).pdfjsWorker = await import(workerModulePath);
      }

      const retryBytes = this.cloneBytes(arrayBuffer);
      const doc = await pdfjs.getDocument({ data: retryBytes }).promise;
      return await this.readAllPages(doc);
    }
  }
}