import type { TFile, Vault } from "obsidian";
import type { LLMWikiSettings } from "../../types";
import { FrontmatterMerger } from "./FrontmatterMerger";
import { ProviderFactory } from "../../providers/ProviderFactory";
import { SchemaLoader } from "../../schema/SchemaLoader";

function titleFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function isRelationEligible(path: string, wikiPath: string): boolean {
  return ["sources", "entities", "concepts"].some((dir) => path.startsWith(`${wikiPath}/${dir}/`));
}

export class RelationService {
  constructor(private vault: Vault, private settings: Pick<LLMWikiSettings, "wikiPath" | "relationTypesOverride">) {}

  async relateMultiple(pageTitles: string[]): Promise<void> {
    for (const title of pageTitles) {
      await this.relateSingle(title);
    }
  }

  async relateSingle(pageTitle: string): Promise<void> {
    const files = this.vault
      .getFiles()
      .filter((f) => f.extension === "md" && isRelationEligible(f.path, this.settings.wikiPath)) as TFile[];
    const target = files.find((f) => titleFromPath(f.path) === pageTitle);
    if (!target) {
      return;
    }

    const targetContent = await this.vault.cachedRead(target);
    const relationFields = new Map<string, string[]>();
    relationFields.set("related", []);

    const fullSettings = this.settings as LLMWikiSettings;
    const provider = ProviderFactory.create(fullSettings);
    const schema = await SchemaLoader.load(this.vault, fullSettings);

    const candidates = files
      .filter((x) => x.path !== target.path)
      .map((x) => ({ title: titleFromPath(x.path), link: `[[${x.path.replace(/\.md$/, "")}]]` }));

    let llmData: Record<string, string[]> | null = null;
    try {
      let raw = "";
      for await (const chunk of provider.chat([
        {
          role: "system",
          content:
            "Return only JSON mapping relation field to array of wikilinks. Use allowed fields and only links that exist in candidates.",
          timestamp: ""
        },
        {
          role: "user",
          content: [
            `Target page title: ${pageTitle}`,
            `Allowed relation fields: ${schema.relationTypes.join(", ")}`,
            `Candidates: ${candidates.map((c) => c.link).join(", ")}`,
            `Target content:\n${targetContent.slice(0, 5000)}`,
            "Output format example: {\"related\":[\"[[wiki/concepts/A]]\"],\"supports\":[\"[[wiki/concepts/B]]\"]}"
          ].join("\n\n"),
          timestamp: ""
        }
      ])) {
        raw += chunk;
      }
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end > start) {
        llmData = JSON.parse(raw.slice(start, end + 1)) as Record<string, string[]>;
      }
    } catch {
      llmData = null;
    }

    if (llmData) {
      for (const [field, links] of Object.entries(llmData)) {
        const key = schema.relationTypes.includes(field) ? field : "related";
        const valid = (links ?? []).filter((link) => candidates.some((c) => c.link === link));
        relationFields.set(key, (relationFields.get(key) ?? []).concat(valid));
      }
    } else {
      // Fallback: simple title mention heuristic.
      for (const file of files) {
        if (file.path === target.path) continue;
        const title = titleFromPath(file.path);
        if (targetContent.includes(title)) {
          relationFields.set("related", (relationFields.get("related") ?? []).concat(`[[${file.path.replace(/\.md$/, "")}]]`));
        }
      }
    }

    let updated = targetContent;
    for (const [field, links] of relationFields.entries()) {
      updated = FrontmatterMerger.merge(updated, field, links);
    }

    await this.vault.modify(target, updated);

    // Ensure reverse generic relation for graph visibility.
    const reverseLinks = relationFields.get("related") ?? [];
    for (const link of reverseLinks) {
      const targetPath = link.replace(/^\[\[/, "").replace(/\]\]$/, "") + ".md";
      const file = this.vault.getAbstractFileByPath(targetPath) as TFile | null;
      if (!file) continue;
      const content = await this.vault.cachedRead(file);
      const merged = FrontmatterMerger.merge(content, "related", [`[[${target.path.replace(/\.md$/, "")}]]`]);
      await this.vault.modify(file, merged);
    }
  }
}