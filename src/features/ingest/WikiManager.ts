import type { Vault } from "obsidian";

export class WikiManager {
  constructor(private vault: Vault, private wikiPath: string) {}

  private static readonly SECTION_TITLES: Record<string, string> = {
    entities: "實體（Entities）",
    concepts: "概念（Concepts）",
    sources: "來源（Sources）",
    analyses: "分析（Analyses）",
    other: "其他（Others）"
  };

  async ensureStructure(subdirs: string[]): Promise<void> {
    await this.ensureDir(this.wikiPath);
    for (const dir of subdirs) {
      await this.ensureDir(`${this.wikiPath}/${dir}`);
    }
    const indexPath = `${this.wikiPath}/index.md`;
    const logPath = `${this.wikiPath}/log.md`;
    if (!(await (this.vault.adapter as any).exists(indexPath))) {
      await (this.vault.adapter as any).write(indexPath, "# Wiki Index\n");
    }
    if (!(await (this.vault.adapter as any).exists(logPath))) {
      await (this.vault.adapter as any).write(logPath, "# Wiki Log\n");
    }
  }

  async writePage(path: string, content: string): Promise<void> {
    const exists = await (this.vault.adapter as any).exists(path);
    if (exists) {
      await (this.vault.adapter as any).write(path, content);
    } else {
      await this.vault.create(path, content);
    }
  }

  async updateIndex(title: string, path: string): Promise<void> {
    void title;
    void path;
    await this.rebuildIndex();
  }

  async rebuildIndex(): Promise<void> {
    const indexPath = `${this.wikiPath}/index.md`;
    const grouped = new Map<string, Array<{ pathNoExt: string; title: string }>>();
    const files = this.vault.getFiles().filter((f) => {
      if (f.extension !== "md") return false;
      if (!f.path.startsWith(`${this.wikiPath}/`)) return false;
      return !f.path.endsWith("/index.md") && !f.path.endsWith("/log.md");
    });

    for (const file of files) {
      const rel = file.path.slice(this.wikiPath.length + 1);
      const [firstSegment] = rel.split("/");
      const group = firstSegment && rel.includes("/") ? firstSegment : "other";
      const arr = grouped.get(group) ?? [];
      arr.push({
        pathNoExt: file.path.replace(/\.md$/, ""),
        title: file.name.replace(/\.md$/, "")
      });
      grouped.set(group, arr);
    }

    const sectionOrder = ["entities", "concepts", "sources", "analyses", "other"];
    const lines: string[] = ["# Wiki 索引", ""];

    for (const section of sectionOrder) {
      const entries = grouped.get(section);
      if (!entries || entries.length === 0) continue;
      entries.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant"));
      lines.push(`## ${WikiManager.SECTION_TITLES[section]}`);
      for (const entry of entries) {
        lines.push(`- [[${entry.pathNoExt}]] - ${entry.title}`);
      }
      lines.push("");
    }

    if (lines.length === 2) {
      lines.push("（尚無頁面）", "");
    }

    await (this.vault.adapter as any).write(indexPath, `${lines.join("\n").trimEnd()}\n`);
  }

  async appendToLog(entry: string, details?: Record<string, string | number | boolean>): Promise<void> {
    const logPath = `${this.wikiPath}/log.md`;
    const adapter = this.vault.adapter as any;
    const exists = await adapter.exists(logPath);
    const current = exists ? (await adapter.read(logPath)) || "# Wiki Log\n" : "# Wiki Log\n";
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    const detailLines = details
      ? Object.entries(details)
          .filter(([, value]) => value !== "")
          .map(([key, value]) => `- ${key}: ${String(value)}`)
      : [];
    const block = [`## [${ts}] ${entry}`, ...detailLines].join("\n");
    await adapter.write(logPath, `${current.trimEnd()}\n\n${block}\n`);
  }

  private async ensureDir(path: string): Promise<void> {
    const exists = await (this.vault.adapter as any).exists(path);
    if (!exists) {
      await (this.vault.adapter as any).mkdir(path);
    }
  }
}