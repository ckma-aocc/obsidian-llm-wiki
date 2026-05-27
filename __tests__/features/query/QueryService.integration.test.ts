import { QueryService } from "../../../src/features/query/QueryService";
import { createFakeVault } from "../../helpers/fakeVault";

describe("QueryService integration", () => {
  it("reads wiki pages, builds prompt context, and streams provider output", async () => {
    const { vault } = createFakeVault({
      "wiki/concepts/ML.md": "# ML\nMachine learning basics",
      "wiki/concepts/NLP.md": "# NLP\nNatural language processing"
    });

    const provider = {
      chat: jest.fn(async function* () {
        yield "Answer part 1 ";
        yield "and part 2";
      })
    };

    const service = new QueryService(
      vault,
      provider as any,
      {
        systemPrompt: "You are wiki assistant",
        pageTypes: ["concept"],
        relationTypes: ["related"],
        defaultPageType: "concept"
      },
      { wikiPath: "wiki" }
    );

    const chunks: string[] = [];
    const full = await service.query("What is ML?", [], (c) => chunks.push(c));

    expect(full).toBe("Answer part 1 and part 2");
    expect(chunks.join("")).toBe(full);
    expect(provider.chat).toHaveBeenCalledTimes(1);
    const messages = (provider.chat as jest.Mock).mock.calls[0][0] as Array<{ content: string }>;
    expect(messages[0].content).toContain("ML.md");
    expect(messages[0].content).toContain("NLP.md");
  });
});