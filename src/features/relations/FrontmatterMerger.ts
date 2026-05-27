function uniqueLinks(links: string[]): string[] {
  return Array.from(new Set(links.filter(Boolean)));
}

function parseInlineArray(raw: string): string[] {
  const cleaned = raw.trim();
  if (!cleaned) return [];
  try {
    const json = JSON.parse(cleaned.replace(/'/g, '"'));
    if (Array.isArray(json)) return json.map(String);
  } catch {
    return [];
  }
  return [];
}

export class FrontmatterMerger {
  static merge(content: string, field: string, newLinks: string[]): string {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const mergedLinks = uniqueLinks(newLinks);
    if (!match) {
      const frontmatter = `---\nwiki_type: concept\n${field}: ${JSON.stringify(mergedLinks)}\n---\n\n`;
      return `${frontmatter}${content}`;
    }

    const fm = match[1];
    const body = match[2];
    const regex = new RegExp(`^${field}:\\s*(.*)$`, "m");
    const line = fm.match(regex);
    let nextFm = fm;
    if (line) {
      const existing = parseInlineArray(line[1]);
      const merged = uniqueLinks(existing.concat(mergedLinks));
      nextFm = fm.replace(regex, `${field}: ${JSON.stringify(merged)}`);
    } else {
      nextFm = `${fm}\n${field}: ${JSON.stringify(mergedLinks)}`;
    }
    return `---\n${nextFm}\n---\n${body}`;
  }
}