import { IngestService } from "../../../src/features/ingest/IngestService";
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

describe("IngestService integration", () => {
  function extractTagList(markdown: string): string[] {
    const match = markdown.match(/tags:\s*\[([^\]]*)\]/);
    if (!match) return [];
    return match[1]
      .split(",")
      .map((x) => x.trim().replace(/^"|"$/g, ""))
      .filter((x) => x.length > 0);
  }

  it("ingests markdown source and updates wiki/index/log/hash", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* (messages: any[]) {
        if ((messages[0]?.content ?? "").includes("Return only JSON")) {
          yield "{}";
          return;
        }
        yield "Generated summary content";
      }
    });

    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "schema prompt",
      pageTypes: ["summary"],
      relationTypes: ["related"],
      defaultPageType: "summary"
    });

    const { vault, files } = createFakeVault({
      "raw/source.md": "# Source\nImportant input"
    });

    const service = new IngestService(
      vault,
      {
        provider: "openai",
        apiKey: "x",
        model: "m",
        baseUrl: "",
        rawSourcesPath: "raw",
        wikiPath: "wiki",
        sessionsPath: ".llm-wiki/sessions",
        wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
        autoIngest: false,
        autoIngestDebounceMs: 2000,
        useWikiSchemaFile: false,
        systemPrompt: "",
        defaultPageTypeOverride: "",
        relationTypesOverride: "",
        lintSchedule: "off",
        contextWindowSize: 20,
        maxMessagesPerSession: 500
      } as any
    );

    const progress: string[] = [];
    await service.ingestByPath("raw/source.md", false, (m) => progress.push(m));

    expect(files["wiki/sources/source.md"]).toContain("Generated summary content");
    expect(files["wiki/sources/source.md"]).not.toContain("tags: [wiki]");
    const sourceTags = extractTagList(files["wiki/sources/source.md"]);
    expect(sourceTags.length).toBeGreaterThanOrEqual(3);
    expect(sourceTags.length).toBeLessThanOrEqual(10);
    expect(files["wiki/index.md"]).toContain("[[wiki/sources/source]]");
    expect(files["wiki/log.md"]).toContain("ingest | source");
    expect(files[".llm-wiki/ingest-hashes.json"]).toContain("raw/source.md");
    expect(progress.some((x) => x.includes("Ingest complete"))).toBe(true);
  });

  it("ingest-all continues on failure and returns failed list", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* () {
        yield "Generated";
      }
    });
    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "schema prompt",
      pageTypes: ["summary"],
      relationTypes: ["related"],
      defaultPageType: "summary"
    });

    const { vault, files } = createFakeVault({
      "raw/a.md": "A",
      "raw/b.md": "B"
    });

    // Make one path invalid by removing it from lookup during ingest.
    const origGet = vault.getAbstractFileByPath;
    vault.getAbstractFileByPath = jest.fn((path: string) => {
      if (path === "raw/b.md") return null;
      return origGet(path);
    });

    const service = new IngestService(
      vault,
      {
        provider: "openai",
        apiKey: "x",
        model: "m",
        baseUrl: "",
        rawSourcesPath: "raw",
        wikiPath: "wiki",
        sessionsPath: ".llm-wiki/sessions",
        wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
        autoIngest: false,
        autoIngestDebounceMs: 2000,
        useWikiSchemaFile: false,
        systemPrompt: "",
        defaultPageTypeOverride: "",
        relationTypesOverride: "",
        lintSchedule: "off",
        contextWindowSize: 20,
        maxMessagesPerSession: 500
      } as any
    );

    const failed = await service.ingestAll(null, false, () => undefined);
    expect(failed).toEqual(["raw/b.md"]);
    expect(files["wiki/sources/a.md"] ?? files["wiki/sources/a.md"]).toBeDefined();
  });

  it("creates derived entity and concept pages during ingest", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* (messages: any[]) {
        const first = messages[0]?.content ?? "";
        const user = messages[1]?.content ?? "";
        if (first.includes("Return only JSON mapping relation field")) {
          yield "{}";
          return;
        }
        if (user.includes("The JSON must contain exactly two keys:")) {
          yield '{"entities":[{"title":"Authorization Middleware","content":"Entity page content"}],"concepts":[{"title":"JWT Verification","content":"Concept page content"}]}';
          return;
        }
        yield "Generated summary content";
      }
    });

    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "schema prompt",
      pageTypes: ["summary", "entity", "concept"],
      relationTypes: ["related"],
      defaultPageType: "summary"
    });

    const { vault, files } = createFakeVault({
      "raw/source.md": "# Source\nImportant input"
    });

    const service = new IngestService(
      vault,
      {
        provider: "openai",
        apiKey: "x",
        model: "m",
        baseUrl: "",
        rawSourcesPath: "raw",
        wikiPath: "wiki",
        sessionsPath: ".llm-wiki/sessions",
        wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
        autoIngest: false,
        autoIngestDebounceMs: 2000,
        useWikiSchemaFile: false,
        systemPrompt: "",
        defaultPageTypeOverride: "",
        relationTypesOverride: "",
        lintSchedule: "off",
        contextWindowSize: 20,
        maxMessagesPerSession: 500
      } as any
    );

    await service.ingestByPath("raw/source.md", false, () => undefined);

    expect(files["wiki/entities/Authorization Middleware.md"]).toContain("Entity page content");
    expect(files["wiki/concepts/JWT Verification.md"]).toContain("Concept page content");
    expect(files["wiki/entities/Authorization Middleware.md"]).not.toContain("tags: [wiki]");
    expect(files["wiki/concepts/JWT Verification.md"]).not.toContain("tags: [wiki]");
    const entityTags = extractTagList(files["wiki/entities/Authorization Middleware.md"]);
    const conceptTags = extractTagList(files["wiki/concepts/JWT Verification.md"]);
    expect(entityTags.length).toBeGreaterThanOrEqual(3);
    expect(entityTags.length).toBeLessThanOrEqual(10);
    expect(conceptTags.length).toBeGreaterThanOrEqual(3);
    expect(conceptTags.length).toBeLessThanOrEqual(10);
    expect(files["wiki/index.md"]).toContain("[[wiki/entities/Authorization Middleware]]");
    expect(files["wiki/index.md"]).toContain("[[wiki/concepts/JWT Verification]]");
  });

  it("cleans nonexistent wikilinks during ingest while keeping valid links", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    ProviderFactory.create.mockReturnValue({
      chat: async function* (messages: any[]) {
        const first = messages[0]?.content ?? "";
        const user = messages[1]?.content ?? "";
        if (first.includes("Return only JSON mapping relation field")) {
          yield "{}";
          return;
        }
        if (user.includes("The JSON must contain exactly two keys:")) {
          yield '{"entities":[{"title":"AuthorizationEntity","content":"Entity details"}],"concepts":[]}';
          return;
        }
        yield "Related to [[AuthorizationEntity]] and unknown [[JWT]].";
      }
    });

    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "schema prompt",
      pageTypes: ["summary", "entity", "concept"],
      relationTypes: ["related"],
      defaultPageType: "summary"
    });

    const { vault, files } = createFakeVault({
      "raw/source.md": "# Source\nImportant input"
    });

    const service = new IngestService(
      vault,
      {
        provider: "openai",
        apiKey: "x",
        model: "m",
        baseUrl: "",
        rawSourcesPath: "raw",
        wikiPath: "wiki",
        sessionsPath: ".llm-wiki/sessions",
        wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
        autoIngest: false,
        autoIngestDebounceMs: 2000,
        useWikiSchemaFile: false,
        systemPrompt: "",
        defaultPageTypeOverride: "",
        relationTypesOverride: "",
        lintSchedule: "off",
        contextWindowSize: 20,
        maxMessagesPerSession: 500
      } as any
    );

    await service.ingestByPath("raw/source.md", false, () => undefined);

    expect(files["wiki/sources/source.md"]).toContain("[[AuthorizationEntity]]");
    expect(files["wiki/sources/source.md"]).not.toContain("[[JWT]]");
    expect(files["wiki/sources/source.md"]).toContain("unknown JWT");
  });

  it("passes selected output language into source and derived generation prompts", async () => {
    const { ProviderFactory } = jest.requireMock("../../../src/providers/ProviderFactory");
    const { SchemaLoader } = jest.requireMock("../../../src/schema/SchemaLoader");

    const seenUserPrompts: string[] = [];
    ProviderFactory.create.mockReturnValue({
      chat: async function* (messages: any[]) {
        const user = String(messages[1]?.content ?? "");
        seenUserPrompts.push(user);
        if (user.includes("exactly two keys")) {
          yield '{"entities":[],"concepts":[]}';
          return;
        }
        if (user.includes("Return only JSON")) {
          yield "{}";
          return;
        }
        yield "Generated summary content";
      }
    });

    SchemaLoader.load.mockResolvedValue({
      systemPrompt: "schema prompt",
      pageTypes: ["summary", "entity", "concept"],
      relationTypes: ["related"],
      defaultPageType: "summary"
    });

    const { vault } = createFakeVault({
      "raw/source.md": "# Source\nImportant input"
    });

    const service = new IngestService(
      vault,
      {
        provider: "openai",
        apiKey: "x",
        model: "m",
        baseUrl: "",
        rawSourcesPath: "raw",
        wikiPath: "wiki",
        sessionsPath: ".llm-wiki/sessions",
        wikiSubdirs: ["sources", "entities", "concepts", "analyses"],
        autoIngest: false,
        autoIngestDebounceMs: 2000,
        useWikiSchemaFile: false,
        systemPrompt: "",
        defaultPageTypeOverride: "",
        relationTypesOverride: "",
        outputLanguage: "en",
        lintSchedule: "off",
        contextWindowSize: 20,
        maxMessagesPerSession: 500
      } as any
    );

    await service.ingestByPath("raw/source.md", true, () => undefined);

    const languageInstruction = "Write all generated wiki page content in English.";
    expect(seenUserPrompts.some((p) => p.includes(languageInstruction))).toBe(true);
    expect(seenUserPrompts.some((p) => p.includes("Summarize this source into a concise wiki page"))).toBe(true);
    expect(seenUserPrompts.some((p) => p.includes("The JSON must contain exactly two keys:"))).toBe(true);
  });
});