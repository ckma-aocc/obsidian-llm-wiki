import { RelationService } from "../../../src/features/relations/RelationService";
import { createFakeVault } from "../../helpers/fakeVault";

jest.mock("../../../src/providers/ProviderFactory", () => ({
  ProviderFactory: {
    create: jest.fn()
  }
}));

jest.mock("../../../src/schema/SchemaLoader", () => ({
  SchemaLoader: {
    load: jest.fn()
  }
}));

describe("RelationService integration", () => {
  it("writes relation fields and reverse related link", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* () {
        yield '{"related":["[[wiki/entities/B]]"],"supports":["[[wiki/entities/B]]"]}';
      }
    });
    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "",
      pageTypes: ["concept"],
      relationTypes: ["related", "supports"],
      defaultPageType: "concept"
    });

    const { vault, files } = createFakeVault({
      "wiki/entities/A.md": "---\nwiki_type: concept\nrelated: []\n---\n\n# A\nTalks about B",
      "wiki/entities/B.md": "---\nwiki_type: concept\nrelated: []\n---\n\n# B"
    });

    const service = new RelationService(vault, {
      wikiPath: "wiki",
      relationTypesOverride: ""
    } as any);

    await service.relateSingle("A");

    expect(files["wiki/entities/A.md"]).toContain("related");
    expect(files["wiki/entities/A.md"]).toContain("[[wiki/entities/B]]");
    expect(files["wiki/entities/A.md"]).toContain("supports");
    expect(files["wiki/entities/B.md"]).toContain("[[wiki/entities/A]]");
  });

  it("only analyzes sources/entities/concepts folders and ignores index/log", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* () {
        yield '{"related":["[[wiki/index]]","[[wiki/entities/B]]"]}';
      }
    });
    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "",
      pageTypes: ["concept"],
      relationTypes: ["related"],
      defaultPageType: "concept"
    });

    const { vault, files } = createFakeVault({
      "wiki/index.md": "# Wiki 索引",
      "wiki/log.md": "# Wiki Log",
      "wiki/entities/A.md": "---\nwiki_type: concept\nrelated: []\n---\n\n# A",
      "wiki/entities/B.md": "---\nwiki_type: concept\nrelated: []\n---\n\n# B"
    });

    const service = new RelationService(vault, {
      wikiPath: "wiki",
      relationTypesOverride: ""
    } as any);

    await service.relateSingle("A");

    expect(files["wiki/entities/A.md"]).toContain("[[wiki/entities/B]]");
    expect(files["wiki/entities/A.md"]).not.toContain("[[wiki/index]]");
  });
});