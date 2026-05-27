import { ContentHasher } from "../../../src/features/ingest/ContentHasher";

describe("ContentHasher", () => {
  it("returns stable hash for same content", async () => {
    const h1 = await ContentHasher.hash("same");
    const h2 = await ContentHasher.hash("same");
    expect(h1).toBe(h2);
  });

  it("returns different hash for different content", async () => {
    const h1 = await ContentHasher.hash("a");
    const h2 = await ContentHasher.hash("b");
    expect(h1).not.toBe(h2);
  });
});