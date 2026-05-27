import { FileParser } from "../../../src/features/ingest/FileParser";

function file(path: string, ext: string) {
  return { path, name: path.split("/").pop(), extension: ext } as any;
}

describe("FileParser", () => {
  it("supports expected extensions", () => {
    expect(FileParser.supports(file("raw/a.md", "md"))).toBe(true);
    expect(FileParser.supports(file("raw/a.pdf", "pdf"))).toBe(true);
    expect(FileParser.supports(file("raw/a.docx", "docx"))).toBe(true);
    expect(FileParser.supports(file("raw/a.xlsx", "xlsx"))).toBe(true);
    expect(FileParser.supports(file("raw/a.pptx", "pptx"))).toBe(true);
    expect(FileParser.supports(file("raw/a.png", "png"))).toBe(true);
    expect(FileParser.supports(file("raw/a.jpg", "jpg"))).toBe(true);
    expect(FileParser.supports(file("raw/a.zip", "zip"))).toBe(false);
  });

  it("parses markdown using cachedRead", async () => {
    const vault: any = {
      cachedRead: jest.fn().mockResolvedValue("# Note"),
      readBinary: jest.fn()
    };
    const parsed = await FileParser.parse(file("raw/note.md", "md"), vault);
    expect(parsed).toEqual({ type: "text", text: "# Note" });
    expect(vault.cachedRead).toHaveBeenCalledTimes(1);
  });

  it("throws on unsupported extension", async () => {
    const vault: any = {
      cachedRead: jest.fn(),
      readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0))
    };
    await expect(FileParser.parse(file("raw/a.zip", "zip"), vault)).rejects.toThrow("Unsupported file type");
  });
});