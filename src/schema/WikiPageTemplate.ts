export class WikiPageTemplate {
  static render(
    title: string,
    content: string,
    pageType: string,
    relations: Record<string, string[]> = {},
    tags: string[] = []
  ): string {
    const now = new Date().toISOString().slice(0, 10);
    const relationKeys = Object.keys(relations);
    const normalizedTags = Array.from(
      new Set(
        tags
          .map((tag) => tag.trim().replace(/^#/, ""))
          .filter((tag) => tag.length > 0)
      )
    ).slice(0, 10);
    const tagsLine = `tags: [${normalizedTags.map((tag) => JSON.stringify(tag)).join(", ")}]`;
    const relationLines = relationKeys.length
      ? relationKeys
          .map((key) => {
            const links = relations[key] ?? [];
            return `${key}:\n${links.map((x) => `  - "${x}"`).join("\n")}`;
          })
          .join("\n")
      : "related: []";

    return [
      "---",
      `wiki_type: ${pageType}`,
      `title: ${title}`,
      `created: ${now}`,
      `updated: ${now}`,
      tagsLine,
      relationLines,
      "---",
      "",
      content
    ].join("\n");
  }
}