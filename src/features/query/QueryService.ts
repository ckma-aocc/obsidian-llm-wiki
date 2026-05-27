import type { TFile, Vault } from "obsidian";
import type { ChatMessage, LLMWikiSettings, WikiSchema } from "../../types";
import type { LLMProvider } from "../../providers/LLMProvider";

const MAX_CONTEXT_CHARS = 12000;

export class QueryService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, "wikiPath">
  ) {}

  async query(question: string, history: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const wikiContext = await this.buildWikiContext();
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${this.schema.systemPrompt}\n\nUse wiki context and include [[wikilinks]] in answers.\n\n${wikiContext}`,
        timestamp: ""
      },
      ...history,
      { role: "user", content: question, timestamp: new Date().toISOString() }
    ];

    let full = "";
    for await (const token of this.provider.chat(messages)) {
      full += token;
      onChunk(token);
    }
    return full;
  }

  private async buildWikiContext(): Promise<string> {
    const wikiFiles = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.settings.wikiPath) && f.extension === "md");

    const parts: string[] = [];
    let total = 0;
    for (const file of wikiFiles) {
      if (total >= MAX_CONTEXT_CHARS) break;
      const content = await this.vault.cachedRead(file as TFile);
      const excerpt = content.slice(0, 1600);
      parts.push(`## ${file.name}\n${excerpt}`);
      total += excerpt.length;
    }
    return parts.join("\n\n") || "No wiki pages yet.";
  }
}