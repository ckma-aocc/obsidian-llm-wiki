import { KNOWN_COMMANDS, SlashCommandParser } from "../../src/ui/SlashCommandParser";

describe("SlashCommandParser", () => {
  it("returns null for plain text", () => {
    expect(SlashCommandParser.parse("hello")).toBeNull();
  });

  it("parses known command with args", () => {
    expect(SlashCommandParser.parse("/ingest raw/note.pdf")).toEqual({
      command: "ingest",
      args: "raw/note.pdf"
    });
  });

  it("parses known command without args", () => {
    expect(SlashCommandParser.parse("/lint")).toEqual({
      command: "lint",
      args: ""
    });
  });

  it("parses clean-links command", () => {
    expect(SlashCommandParser.parse("/clean-links")).toEqual({
      command: "clean-links",
      args: ""
    });
  });

  it("parses reindex command", () => {
    expect(SlashCommandParser.parse("/reindex")).toEqual({
      command: "reindex",
      args: ""
    });
  });

  it("parses log-tail command", () => {
    expect(SlashCommandParser.parse("/log-tail 20")).toEqual({
      command: "log-tail",
      args: "20"
    });
  });

  it("parses log-filter command", () => {
    expect(SlashCommandParser.parse("/log-filter ingest|query|lint")).toEqual({
      command: "log-filter",
      args: "ingest|query|lint"
    });
  });

  it("treats unknown slash command as plain query", () => {
    expect(SlashCommandParser.parse("/unknown hello")).toBeNull();
  });

  it("contains required commands", () => {
    expect(KNOWN_COMMANDS).toEqual(
      expect.arrayContaining([
        "ingest",
        "reingest",
        "save",
        "lint",
        "relate",
        "clean-links",
        "log-tail",
        "log-filter",
        "reindex",
        "summarize",
        "help"
      ])
    );
  });
});