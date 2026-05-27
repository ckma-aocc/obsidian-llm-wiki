import { SchemaLoader } from "../../src/schema/SchemaLoader";
import { DEFAULT_SETTINGS } from "../../src/settings/Settings";
import { createFakeVault } from "../helpers/fakeVault";

describe("SchemaLoader", () => {
  it("uses defaults when no schema file and no overrides", async () => {
    const { vault } = createFakeVault();
    const schema = await SchemaLoader.load(vault as any, {
      ...DEFAULT_SETTINGS,
      useWikiSchemaFile: true,
      systemPrompt: "",
      defaultPageTypeOverride: "",
      relationTypesOverride: ""
    });
    expect(schema.pageTypes).toContain("concept");
    expect(schema.defaultPageType).toBe("concept");
  });

  it("parses WIKI_SCHEMA.md and then applies settings overrides", async () => {
    const { vault } = createFakeVault({
      "WIKI_SCHEMA.md": "defaultPageType: summary\nrelationTypes: related, supports, contradicts"
    });

    const schema = await SchemaLoader.load(vault as any, {
      ...DEFAULT_SETTINGS,
      useWikiSchemaFile: true,
      systemPrompt: "override prompt",
      defaultPageTypeOverride: "qa",
      relationTypesOverride: "mentions, derived_from"
    });

    expect(schema.systemPrompt).toBe("override prompt");
    expect(schema.defaultPageType).toBe("qa");
    expect(schema.relationTypes).toEqual(["mentions", "derived_from"]);
  });
});