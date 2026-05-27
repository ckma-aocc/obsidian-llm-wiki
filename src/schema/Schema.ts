import type { WikiSchema } from "../types";

export const DEFAULT_SCHEMA: WikiSchema = {
  systemPrompt:
    "You are LLM Wiki. Maintain a consistent Obsidian wiki with frontmatter and wikilink citations.",
  pageTypes: ["concept", "summary", "qa"],
  relationTypes: ["related", "is_a", "part_of", "mentions", "supports", "contradicts", "derived_from"],
  defaultPageType: "concept"
};