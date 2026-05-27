import type { Vault } from "obsidian";
import type { LLMWikiSettings, WikiSchema } from "../types";
import { DEFAULT_SCHEMA } from "./Schema";

function parseSchemaMarkdown(raw: string): Partial<WikiSchema> {
  const out: Partial<WikiSchema> = {};
  const defaultType = raw.match(/defaultPageType\s*:\s*([\w-]+)/i);
  if (defaultType) out.defaultPageType = defaultType[1].trim();

  const relTypes = raw.match(/relationTypes\s*:\s*([\w,\s-_]+)/i);
  if (relTypes) {
    out.relationTypes = relTypes[1]
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return out;
}

export class SchemaLoader {
  static async load(vault: Vault, settings: LLMWikiSettings): Promise<WikiSchema> {
    let schema: WikiSchema = { ...DEFAULT_SCHEMA };
    const schemaPath = "WIKI_SCHEMA.md";

    if (settings.useWikiSchemaFile) {
      const exists = await (vault.adapter as any).exists(schemaPath);
      if (exists) {
        const raw = await (vault.adapter as any).read(schemaPath);
        const parsed = parseSchemaMarkdown(raw);
        schema = {
          ...schema,
          ...parsed,
          relationTypes: parsed.relationTypes ?? schema.relationTypes
        };
      }
    }

    if (settings.systemPrompt.trim()) {
      schema.systemPrompt = settings.systemPrompt;
    }
    if (settings.defaultPageTypeOverride.trim()) {
      schema.defaultPageType = settings.defaultPageTypeOverride.trim();
    }
    if (settings.relationTypesOverride.trim()) {
      schema.relationTypes = settings.relationTypesOverride
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }

    return schema;
  }
}