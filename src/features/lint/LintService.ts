import type { TFile, Vault } from "obsidian";
import type { ChatMessage, LLMWikiSettings, WikiSchema } from "../../types";
import type { LLMProvider } from "../../providers/LLMProvider";

export interface BrokenLink {
  sourcePage: string;
  link: string;
}

export interface LintReport {
  orphans: string[];
  brokenLinks: BrokenLink[];
  llmAnalysis: string;
}

function extractLinks(markdown: string): string[] {
  return markdown.match(/\[\[[^\]]+\]\]/g) ?? [];
}

function normalizeLink(link: string): string {
  const inner = link.replace(/^\[\[/, "").replace(/\]\]$/, "");
  return inner.split("|")[0].trim().split("/").pop() ?? inner;
}

export class LintService {
  constructor(
    private vault: Vault,
    private provider: LLMProvider,
    private schema: WikiSchema,
    private settings: Pick<LLMWikiSettings, "wikiPath">
  ) {}

  async lint(onChunk: (chunk: string) => void): Promise<LintReport> {
    const files = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.settings.wikiPath) && f.extension === "md") as TFile[];

    const pages = new Map<string, string>();
    const incomingCount = new Map<string, number>();
    const outgoingCount = new Map<string, number>();
    const brokenLinks: BrokenLink[] = [];

    for (const f of files) {
      const title = f.name.replace(/\.md$/, "");
      const content = await this.vault.cachedRead(f);
      pages.set(title, content);
      incomingCount.set(title, 0);
      outgoingCount.set(title, 0);
    }

    for (const [sourceTitle, content] of pages.entries()) {
      const links = extractLinks(content);
      let validOutgoing = 0;
      for (const link of links) {
        const target = normalizeLink(link);
        if (!pages.has(target)) {
          brokenLinks.push({ sourcePage: sourceTitle, link });
        } else {
          incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
          validOutgoing += 1;
        }
      }
      outgoingCount.set(sourceTitle, validOutgoing);
    }

    const orphans = Array.from(pages.keys()).filter((name) => {
      if (name === "index" || name === "log") return false;
      const incoming = incomingCount.get(name) ?? 0;
      const outgoing = outgoingCount.get(name) ?? 0;
      return incoming === 0 && outgoing === 0;
    });

    const reportText = [
      `Total pages: ${pages.size}`,
      `Orphans (${orphans.length}): ${orphans.join(", ") || "none"}`,
      `Broken links (${brokenLinks.length}): ${brokenLinks.map((x) => `${x.sourcePage} -> ${x.link}`).join(", ") || "none"}`
    ].join("\n");

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${this.schema.systemPrompt}\nYou are linting a wiki for structure and consistency issues.`,
        timestamp: ""
      },
      {
        role: "user",
        content: `${reportText}\n\nProvide concise actionable fixes and mention contradiction checks.`,
        timestamp: ""
      }
    ];

    let llmAnalysis = "";
    for await (const token of this.provider.chat(messages)) {
      llmAnalysis += token;
      onChunk(token);
    }

    return { orphans, brokenLinks, llmAnalysis };
  }
}