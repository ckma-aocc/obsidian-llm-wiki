import type { LLMWikiSettings, WikiSchema } from "../../types";
import { WikiPageTemplate } from "../../schema/WikiPageTemplate";
import type { WikiManager } from "../ingest/WikiManager";

export class SaveService {
  constructor(
    private wikiManager: WikiManager,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, "wikiPath">
  ) {}

  async save(title: string, content: string, pageType?: string, relations?: Record<string, string[]>): Promise<string> {
    const finalType = pageType ?? this.schema.defaultPageType;
    const rendered = WikiPageTemplate.render(title, content, finalType, relations ?? { related: [] });
    const path = `${this.settings.wikiPath}/analyses/${title}.md`;
    await this.wikiManager.writePage(path, rendered);
    await this.wikiManager.updateIndex(title, path);
    await this.wikiManager.appendToLog(`query | ${title}`, {
      page_type: finalType,
      path
    });
    return path;
  }
}