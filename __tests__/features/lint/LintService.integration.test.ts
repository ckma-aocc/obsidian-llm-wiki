import { LintService } from "../../../src/features/lint/LintService";
import { createFakeVault } from "../../helpers/fakeVault";

describe("LintService integration", () => {
  it("detects broken links and orphans and streams analysis", async () => {
    const { vault } = createFakeVault({
      "wiki/Page A.md": "# A\n[[Page B]]\n[[Missing Page]]",
      "wiki/Page B.md": "# B\n",
      "wiki/Page C.md": "# C\n"
    });

    const provider = {
      chat: jest.fn(async function* () {
        yield "Lint summary";
      })
    };

    const service = new LintService(
      vault,
      provider as any,
      {
        systemPrompt: "lint prompt",
        pageTypes: ["concept"],
        relationTypes: ["related"],
        defaultPageType: "concept"
      },
      { wikiPath: "wiki" }
    );

    const chunks: string[] = [];
    const report = await service.lint((c) => chunks.push(c));

    expect(report.brokenLinks.some((x) => x.link === "[[Missing Page]]")).toBe(true);
    expect(report.orphans).toContain("Page C");
    expect(chunks.join("")).toContain("Lint summary");
  });
});