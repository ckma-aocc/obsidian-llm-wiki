import { FrontmatterMerger } from "../../../src/features/relations/FrontmatterMerger";

const BASE = `---
wiki_type: concept
related: ["[[wiki/A]]"]
---

# Page
Body`;

describe("FrontmatterMerger", () => {
  it("creates frontmatter when missing", () => {
    const merged = FrontmatterMerger.merge("# No frontmatter", "related", ["[[wiki/B]]"]);
    expect(merged.startsWith("---\n")).toBe(true);
    expect(merged).toContain("related");
    expect(merged).toContain("[[wiki/B]]");
  });

  it("appends new field when missing", () => {
    const merged = FrontmatterMerger.merge(BASE, "supports", ["[[wiki/C]]"]);
    expect(merged).toContain("supports");
    expect(merged).toContain("[[wiki/C]]");
  });

  it("deduplicates links in same field", () => {
    const merged = FrontmatterMerger.merge(BASE, "related", ["[[wiki/A]]", "[[wiki/B]]"]);
    const countA = (merged.match(/\[\[wiki\/A\]\]/g) ?? []).length;
    expect(countA).toBe(1);
    expect(merged).toContain("[[wiki/B]]");
  });
});