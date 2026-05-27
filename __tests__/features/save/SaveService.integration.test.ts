import { SaveService } from "../../../src/features/save/SaveService";
import { WikiManager } from "../../../src/features/ingest/WikiManager";
import { createFakeVault } from "../../helpers/fakeVault";

describe("SaveService integration", () => {
  it("saves page and updates index/log", async () => {
    const { vault, files } = createFakeVault({
      "wiki/index.md": "# Wiki Index\n",
      "wiki/log.md": "# Wiki Log\n"
    });

    const service = new SaveService(
      new WikiManager(vault, "wiki"),
      {
        systemPrompt: "",
        pageTypes: ["concept", "summary", "qa"],
        relationTypes: ["related"],
        defaultPageType: "concept"
      },
      { wikiPath: "wiki" }
    );

    const path = await service.save("My Topic", "This is saved content.");

    expect(path).toBe("wiki/analyses/My Topic.md");
    expect(files[path]).toContain("wiki_type: concept");
    expect(files[path]).toContain("This is saved content.");
    expect(files["wiki/index.md"]).toContain("[[wiki/analyses/My Topic]]");
    expect(files["wiki/index.md"]).toContain("## 分析（Analyses）");
    expect(files["wiki/log.md"]).toContain("query | My Topic");
    expect(files["wiki/log.md"]).toContain("- page_type: concept");
  });

  it("rebuilds index into categorized sections by folder", async () => {
    const { vault, files } = createFakeVault({
      "wiki/index.md": "# Wiki Index\n- [[wiki/old]] - old\n",
      "wiki/log.md": "# Wiki Log\n",
      "wiki/sources/Source A.md": "# A",
      "wiki/entities/Entity A.md": "# E",
      "wiki/concepts/Concept A.md": "# C"
    });

    const service = new SaveService(
      new WikiManager(vault, "wiki"),
      {
        systemPrompt: "",
        pageTypes: ["concept", "summary", "qa"],
        relationTypes: ["related"],
        defaultPageType: "concept"
      },
      { wikiPath: "wiki" }
    );

    await service.save("Analysis A", "Body");

    expect(files["wiki/index.md"]).toContain("# Wiki 索引");
    expect(files["wiki/index.md"]).toContain("## 實體（Entities）");
    expect(files["wiki/index.md"]).toContain("## 概念（Concepts）");
    expect(files["wiki/index.md"]).toContain("## 來源（Sources）");
    expect(files["wiki/index.md"]).toContain("## 分析（Analyses）");
    expect(files["wiki/index.md"]).toContain("[[wiki/entities/Entity A]]");
    expect(files["wiki/index.md"]).toContain("[[wiki/concepts/Concept A]]");
    expect(files["wiki/index.md"]).toContain("[[wiki/sources/Source A]]");
    expect(files["wiki/index.md"]).toContain("[[wiki/analyses/Analysis A]]");
    expect(files["wiki/index.md"]).not.toContain("[[wiki/old]]");
  });
});