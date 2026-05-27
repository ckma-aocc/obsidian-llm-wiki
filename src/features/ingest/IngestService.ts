import type { TFile, Vault } from "obsidian";
import type { LLMWikiSettings } from "../../types";
import { ProviderFactory } from "../../providers/ProviderFactory";
import { SchemaLoader } from "../../schema/SchemaLoader";
import { WikiPageTemplate } from "../../schema/WikiPageTemplate";
import { FileParser } from "./FileParser";
import { WikiManager } from "./WikiManager";
import { ContentHasher } from "./ContentHasher";

const HASH_CACHE_FILE = ".llm-wiki/ingest-hashes.json";

type DerivedWikiPage = {
  title: string;
  content: string;
  tags: string[];
};

type DerivedWikiPages = {
  entities: DerivedWikiPage[];
  concepts: DerivedWikiPage[];
};

export class IngestService {
  constructor(private vault: Vault, private settings: LLMWikiSettings) {}

  async cleanBrokenWikilinksInWiki(onProgress?: (msg: string) => void): Promise<{ scanned: number; updated: number }> {
    const paths = this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(`${this.settings.wikiPath}/`) && f.extension === "md")
      .map((f) => f.path);

    if (onProgress) {
      onProgress(`Cleaning broken wikilinks in ${paths.length} pages...`);
    }

    const result = await this.cleanNonexistentWikilinksInPages(paths);

    if (onProgress) {
      onProgress(`Cleaned broken wikilinks. Updated ${result.updated}/${result.scanned} pages.`);
    }

    return result;
  }

  async ingestAll(paths: string[] | null, force: boolean, onProgress: (msg: string) => void): Promise<string[]> {
    const rawFiles = (paths && paths.length ? paths : this.collectRawFiles()).map((p) =>
      p.replace(/\\/g, "/").replace(/^\[\[/, "").replace(/\]\]$/, "")
    );
    const failed: string[] = [];
    for (const path of rawFiles) {
      try {
        onProgress(`Ingesting ${path}...`);
        await this.ingestByPath(path, force, onProgress);
      } catch (error) {
        failed.push(path);
        await this.appendIngestErrorLog(path, error);
      }
    }
    return failed;
  }

  async ingestByPath(pathArg: string, force: boolean, onProgress: (msg: string) => void): Promise<void> {
    const clean = pathArg.replace(/\[\[|\]\]/g, "").trim();
    const file = this.vault.getAbstractFileByPath(clean);
    if (!file || !(file as any).extension) {
      const error = new Error(`File not found: ${clean}`);
      await this.appendIngestErrorLog(clean, error);
      throw error;
    }
    try {
      await this.ingestFile(file as TFile, force, onProgress);
    } catch (error) {
      await this.appendIngestErrorLog(clean, error);
      throw error;
    }
  }

  private collectRawFiles(): string[] {
    return this.vault
      .getFiles()
      .filter((f) => f.path.startsWith(this.settings.rawSourcesPath) && FileParser.supports(f as TFile))
      .map((f) => f.path);
  }

  async ingestFile(file: TFile, force: boolean, onProgress: (msg: string) => void): Promise<void> {
    if (!FileParser.supports(file)) {
      throw new Error("Unsupported file type. Supported: md, pdf, png, jpg, doc, docx, xlsx, csv, pptx");
    }

    const manager = new WikiManager(this.vault, this.settings.wikiPath);
    await manager.ensureStructure(this.settings.wikiSubdirs);

    onProgress("Reading source...");
    const parsed = await FileParser.parse(file, this.vault);
    const content = parsed.type === "text" ? parsed.text : `[image:${parsed.mimeType}] ${parsed.base64.slice(0, 64)}...`;

    const hash = await ContentHasher.hash(content);
    const cache = await this.readHashCache();
    if (!force && cache[file.path] === hash) {
      onProgress("Skipping unchanged file");
      await manager.appendToLog(`ingest-skip | ${file.name.replace(/\.[^.]+$/, "")}`, {
        source: file.path,
        reason: "unchanged"
      });
      return;
    }

    const provider = ProviderFactory.create(this.settings);
    const schema = await SchemaLoader.load(this.vault, this.settings);
    const title = file.name.replace(/\.[^.]+$/, "");

    onProgress("Generating wiki content...");
    let generated = "";
    for await (const chunk of provider.chat([
      { role: "system", content: schema.systemPrompt, timestamp: "" },
      {
        role: "user",
        content: `Summarize this source into a concise wiki page with wikilink references where appropriate.\n\nSource file: ${file.path}\n\n${content}`,
        timestamp: ""
      }
    ])) {
      generated += chunk;
      onProgress("Updating wiki page...");
    }

    const pagePath = `${this.settings.wikiPath}/sources/${title}.md`;
    const sourceTags = await this.generateTags(provider, schema.systemPrompt, title, generated, "summary");
    const page = WikiPageTemplate.render(title, generated, "summary", { related: [] }, sourceTags);
    await manager.writePage(pagePath, page);
    await manager.updateIndex(title, pagePath);
    const touchedPaths: string[] = [pagePath];

    onProgress("Extracting entities and concepts...");
    const derived = await this.extractDerivedPages(provider, schema.systemPrompt, title, generated);
    const touchedTitles: string[] = [title];
    await this.writeDerivedPages(manager, "entities", "entity", derived.entities, touchedTitles, touchedPaths, onProgress);
    await this.writeDerivedPages(manager, "concepts", "concept", derived.concepts, touchedTitles, touchedPaths, onProgress);

    await manager.appendToLog(`ingest | ${title}`, {
      source: file.path,
      derived_entities: derived.entities.length,
      derived_concepts: derived.concepts.length,
      touched_pages: touchedPaths.length
    });

    cache[file.path] = hash;
    await this.writeHashCache(cache);

    const { RelationService } = await import("../relations/RelationService");
    await new RelationService(this.vault, this.settings).relateMultiple(touchedTitles);

    onProgress("Cleaning broken wikilinks...");
    await this.cleanNonexistentWikilinksInPages(touchedPaths);

    onProgress("Ingest complete");
  }

  private async extractDerivedPages(
    provider: ReturnType<typeof ProviderFactory.create>,
    systemPrompt: string,
    sourceTitle: string,
    sourceSummary: string
  ): Promise<DerivedWikiPages> {
    let raw = "";
    for await (const chunk of provider.chat([
      { role: "system", content: systemPrompt, timestamp: "" },
      {
        role: "user",
        content: [
            "Return valid JSON only.",
            
            "The JSON must contain exactly two keys: entities and concepts.",
            
            "Each value must be an array of objects with:",
            "- title",
            "- content",
            "- tags",
            
            "The goal is retrieval-oriented wiki generation.",
            
            "Focus on reusable semantic concepts, technical entities, and retrieval precision.",
            
            "Tags are for semantic retrieval and graph linking.",
            
            "Do NOT generate broad topic labels or generic keywords.",
            
            "Prefer canonical technical terminology.",
            
            "Prefer noun phrases and explicit concepts.",
            
            "Avoid vague tags such as:",
            "- advanced",
            "- optimization",
            "- architecture",
            "- technology",
            "- important-concept",
            
            "Tags should represent:",
            "- entities",
            "- technical concepts",
            "- methods",
            "- protocols",
            "- systems",
            "- tasks",
            
            "Each tags array should contain 3 to 5 highly reusable retrieval-oriented tags.",
            
            "Use kebab-case.",
            
            "Do not invent concepts not explicitly supported by the source.",
            
            "Content should be concise markdown.",
            
            "Use wikilinks only when strongly relevant.",
            
            "Think about:",
            "\"What future search queries should retrieve this page?\"",
            
            `Source title: ${sourceTitle}`,
            
            `Source summary:\n${sourceSummary.slice(0, 6000)}`,
            
            "Example:",
            JSON.stringify({
                entities: [
                {
                    title: "FlashAttention",
                    content: "Memory-efficient attention optimization for transformer inference.",
                    tags: [
                    "flashattention",
                    "transformer-inference",
                    "attention-optimization",
                    "cuda-kernel",
                    "memory-bandwidth"
                    ]
                }
                ],
                concepts: [
                {
                    title: "KV Cache",
                    content: "Technique for caching transformer key/value states during autoregressive decoding.",
                    tags: [
                    "kv-cache",
                    "autoregressive-decoding",
                    "transformer-inference",
                    "token-generation",
                    "attention-cache"
                    ]
                }
                ]
            })
        ].join("\n\n"),
        timestamp: ""
      }
    ])) {
      raw += chunk;
    }

    const parsed = this.parseDerivedPages(raw);
    return {
      entities: parsed.entities,
      concepts: parsed.concepts
    };
  }

  private parseDerivedPages(raw: string): DerivedWikiPages {
    const fallback: DerivedWikiPages = { entities: [], concepts: [] };
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end <= start) return fallback;
      const data = JSON.parse(raw.slice(start, end + 1)) as Partial<DerivedWikiPages>;
      return {
        entities: this.normalizeDerivedList(data.entities, "entity"),
        concepts: this.normalizeDerivedList(data.concepts, "concept")
      };
    } catch {
      return fallback;
    }
  }

  private normalizeDerivedList(items: unknown, pageType: string): DerivedWikiPage[] {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        const entry = item as Partial<DerivedWikiPage>;
        const title = (entry.title ?? "").trim();
        const content = (entry.content ?? "").trim();
        const tags = this.ensureTagCount(this.normalizeTagList((entry as any).tags), title, pageType);
        if (!title || !content) return null;
        return { title, content, tags };
      })
      .filter((x): x is DerivedWikiPage => x !== null)
      .slice(0, 8);
  }

  private async writeDerivedPages(
    manager: WikiManager,
    folder: "entities" | "concepts",
    pageType: "entity" | "concept",
    pages: DerivedWikiPage[],
    touchedTitles: string[],
    touchedPaths: string[],
    onProgress: (msg: string) => void
  ): Promise<void> {
    for (const page of pages) {
      const safeTitle = page.title.replace(/[\\/:*?"<>|]/g, "-").trim();
      if (!safeTitle) continue;
      const path = `${this.settings.wikiPath}/${folder}/${safeTitle}.md`;
      onProgress(`Updating [[${this.settings.wikiPath}/${folder}/${safeTitle}]]...`);
      const rendered = WikiPageTemplate.render(safeTitle, page.content, pageType, { related: [] }, page.tags);
      await manager.writePage(path, rendered);
      await manager.updateIndex(safeTitle, path);
      touchedPaths.push(path);
      if (!touchedTitles.includes(safeTitle)) {
        touchedTitles.push(safeTitle);
      }
    }
  }

  private async cleanNonexistentWikilinksInPages(paths: string[]): Promise<{ scanned: number; updated: number }> {
    const index = this.buildWikiLinkIndex();
    let updated = 0;
    for (const path of paths) {
      const file = this.vault.getAbstractFileByPath(path);
      if (!file || !(file as any).extension) continue;
      const original = await this.vault.cachedRead(file as TFile);
      const cleaned = this.cleanWikilinks(original, index);
      if (cleaned !== original) {
        await this.vault.modify(file as TFile, cleaned);
        updated += 1;
      }
    }
    return { scanned: paths.length, updated };
  }

  private buildWikiLinkIndex(): { fullPaths: Set<string>; titlesExact: Set<string>; titlesLower: Set<string> } {
    const fullPaths = new Set<string>();
    const titlesExact = new Set<string>();
    const titlesLower = new Set<string>();
    const wikiRoot = `${this.settings.wikiPath}/`;
    const files = this.vault.getFiles().filter((f) => f.path.startsWith(wikiRoot) && f.extension === "md");
    for (const file of files) {
      const noExt = file.path.replace(/\.md$/i, "");
      fullPaths.add(noExt);
      const title = file.name.replace(/\.md$/i, "");
      titlesExact.add(title);
      titlesLower.add(title.toLowerCase());
    }
    return { fullPaths, titlesExact, titlesLower };
  }

  private cleanWikilinks(
    content: string,
    index: { fullPaths: Set<string>; titlesExact: Set<string>; titlesLower: Set<string> }
  ): string {
    return content.replace(/(!?)\[\[([^\]]+)\]\]/g, (_full, _embed: string, inner: string) => {
      const pipeAt = inner.indexOf("|");
      const targetRaw = (pipeAt >= 0 ? inner.slice(0, pipeAt) : inner).trim();
      const aliasRaw = pipeAt >= 0 ? inner.slice(pipeAt + 1).trim() : "";
      const target = targetRaw.split("#")[0].trim();
      if (!target) return aliasRaw || targetRaw;
      if (this.wikiLinkExists(target, index)) {
        return `[[${inner}]]`;
      }
      const fallback = aliasRaw || this.linkDisplayLabel(targetRaw);
      return fallback || target;
    });
  }

  private wikiLinkExists(
    target: string,
    index: { fullPaths: Set<string>; titlesExact: Set<string>; titlesLower: Set<string> }
  ): boolean {
    const normalized = target.replace(/\\/g, "/").replace(/\.md$/i, "").replace(/^\.\//, "").trim();
    if (!normalized) return false;

    if (index.fullPaths.has(normalized)) return true;
    if (index.fullPaths.has(`${this.settings.wikiPath}/${normalized}`)) return true;

    if (!normalized.includes("/")) {
      if (index.titlesExact.has(normalized)) return true;
      if (index.titlesLower.has(normalized.toLowerCase())) return true;
    }

    return false;
  }

  private linkDisplayLabel(targetRaw: string): string {
    const noAnchor = targetRaw.split("#")[0].trim();
    if (!noAnchor) return "";
    const parts = noAnchor.split("/");
    return parts[parts.length - 1] ?? noAnchor;
  }

  private async readHashCache(): Promise<Record<string, string>> {
    const exists = await (this.vault.adapter as any).exists(HASH_CACHE_FILE);
    if (!exists) return {};
    try {
      const raw = await (this.vault.adapter as any).read(HASH_CACHE_FILE);
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private async writeHashCache(cache: Record<string, string>): Promise<void> {
    const dir = ".llm-wiki";
    if (!(await (this.vault.adapter as any).exists(dir))) {
      await (this.vault.adapter as any).mkdir(dir);
    }
    await (this.vault.adapter as any).write(HASH_CACHE_FILE, JSON.stringify(cache, null, 2));
  }

  private async generateTags(
    provider: ReturnType<typeof ProviderFactory.create>,
    systemPrompt: string,
    title: string,
    content: string,
    pageType: string
  ): Promise<string[]> {
    let raw = "";
    for await (const chunk of provider.chat([
      { role: "system", content: systemPrompt, timestamp: "" },
      {
        role: "user",
        content: [
          "You are a retrieval metadata extraction system.",
          "",
          "Your task is to extract high-value retrieval metadata from the document.",
          "",
          "IMPORTANT:",
          "The goal is NOT summarization.",
          "The goal is to improve future retrieval precision, semantic linking, and knowledge graph construction.",
          "",
          "Extract only reusable semantic concepts.",
          "",
          "# Extraction Rules",
          "",
          "1. Prefer canonical technical terminology",
          "2. Prefer noun phrases only",
          "3. Avoid generic adjectives",
          "4. Avoid subjective labels",
          "5. Avoid vague abstractions",
          "6. Normalize synonymous concepts",
          "7. Use lowercase",
          "8. Maximum 3 words per item before normalization",
          "9. Output only highly reusable retrieval terms",
          "10. Do NOT invent concepts not explicitly present",
          "11. Final tag format must be kebab-case with no spaces",
          "",
          "# Extract These Fields",
          "",
          "- entities",
          "  Named people, companies, projects, APIs, libraries, protocols, products",
          "",
          "- concepts",
          "  Core technical concepts and mechanisms",
          "",
          "- methods",
          "  Algorithms, techniques, optimization methods",
          "",
          "- tools",
          "  Frameworks, SDKs, infra systems, databases",
          "",
          "- tasks",
          "  What problem/task this chunk helps solve",
          "",
          "- domains",
          "  High-level knowledge domains",
          "",
          "- related_topics",
          "  Closely connected concepts useful for graph linking",
          "",
          "# Output Constraints",
          "",
          "- A total of 3 to 10 tags were generated.",
          "- Remove duplicates",
          "- Normalize terminology",
          "- Tags must not contain spaces; replace spaces with dashes",
          "",
          "# Bad Tags Examples",
          "",
          "bad:",
          "- advanced",
          "- useful",
          "- technology",
          "- optimization",
          "- important concept",
          "- and",
          "- or",
          "",
          "# Good Tags Examples",
          "",
          "good:",
          "- kv cache",
          "- speculative decoding",
          "- attention optimization",
          "- vector database",
          "- kernel fusion",
          "",
          "Final output tags should look like:",
          "- kv-cache",
          "- speculative-decoding",
          "- attention-optimization",
          "",
          "Return only JSON.",
          "Output format example:",
          '{"entities":["openai api"],"concepts":["jwt verification"],"methods":["token validation"],"tools":["api gateway"],"tasks":["authentication"],"domains":["access control"],"related_topics":["oauth 2.0"]}',
          `Page type: ${pageType}`,
          `Page title: ${title}`,
          `Page content:\n${content.slice(0, 5000)}`
        ].join("\n\n"),
        timestamp: ""
      }
    ])) {
      raw += chunk;
    }

    const parsed = this.parseTags(raw);
    return this.ensureTagCount(parsed, title, pageType);
  }

  private parseTags(raw: string): string[] {
    try {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start === -1 || end <= start) return [];
      const data = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      const buckets = [
        data.tags,
        data.entities,
        data.concepts,
        data.methods,
        data.tools,
        data.tasks,
        data.domains,
        data.related_topics
      ];
      return this.normalizeTagList(buckets.flatMap((bucket) => (Array.isArray(bucket) ? bucket : [])));
    } catch {
      return [];
    }
  }

  private normalizeTagList(input: unknown): string[] {
    const stopwords = new Set([
      "and",
      "or",
      "the",
      "a",
      "an",
      "of",
      "to",
      "in",
      "for",
      "on",
      "with",
      "by",
      "at",
      "from",
      "is",
      "are"
    ]);
    const generic = new Set(["advanced", "useful", "technology", "optimization", "important concept", "concept"]);
    const list = Array.isArray(input) ? input : [];
    const normalized = list
      .map((x) =>
        String(x ?? "")
          .trim()
          .replace(/^#/, "")
          .toLowerCase()
      )
      .map((x) => x.replace(/\s+/g, " "))
      .filter((x) => x.length > 1)
      .filter((x) => x.split(" ").length <= 3)
      .filter((x) => !stopwords.has(x))
      .filter((x) => !generic.has(x))
      .map((x) => x.replace(/\s+/g, "-"))
      .map((x) => x.replace(/-+/g, "-"))
      .map((x) => x.replace(/^-|-$/g, ""))
      .filter((x) => x.length > 1);
    return Array.from(new Set(normalized)).slice(0, 10);
  }

  private ensureTagCount(tags: string[], title: string, pageType: string): string[] {
    const result = [...tags];
    const fallback = this.buildFallbackTags(title, pageType);
    for (const tag of fallback) {
      if (result.length >= 10) break;
      if (!result.includes(tag)) result.push(tag);
    }
    while (result.length < 3) {
      result.push(`${pageType}-${result.length + 1}`);
    }
    return result.slice(0, 10);
  }

  private buildFallbackTags(title: string, pageType: string): string[] {
    const tokens = title
      .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
      .map((x) => x.trim().toLowerCase())
      .filter((x) => x.length >= 2);
    return Array.from(new Set([pageType, ...tokens])).filter((x) => x !== "and" && x !== "or");
  }

  private async appendIngestErrorLog(path: string, error: unknown): Promise<void> {
    try {
      const manager = new WikiManager(this.vault, this.settings.wikiPath);
      await manager.ensureStructure(this.settings.wikiSubdirs);
      const message = error instanceof Error ? error.message : String(error);
      await manager.appendToLog(`ingest-error | ${path.split("/").pop() ?? path}`, {
        source: path,
        error: message
      });
    } catch {
      // Ignore logging failures to avoid masking the original ingest failure.
    }
  }
}