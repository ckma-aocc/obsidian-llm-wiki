const COMMANDS = [
  "ingest",
  "reingest",
  "ingest-all",
  "save",
  "lint",
  "relate",
  "clean-links",
  "log-tail",
  "log-filter",
  "reindex",
  "summarize",
  "help"
];

export const KNOWN_COMMANDS = COMMANDS;

export interface ParsedSlashCommand {
  command: string;
  args: string;
}

export class SlashCommandParser {
  static parse(text: string): ParsedSlashCommand | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return null;
    const body = trimmed.slice(1);
    const [name, ...rest] = body.split(" ");
    if (!COMMANDS.includes(name)) return null;
    return { command: name, args: rest.join(" ").trim() };
  }
}