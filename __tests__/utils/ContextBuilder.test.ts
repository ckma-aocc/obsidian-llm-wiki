import { ContextBuilder } from "../../src/utils/ContextBuilder";
import type { Session } from "../../src/types";

describe("ContextBuilder", () => {
  it("includes system prompt", () => {
    const session: Session = {
      id: "1",
      title: "t",
      createdAt: "",
      updatedAt: "",
      messages: []
    };
    const result = ContextBuilder.build(session, "system prompt", 20);
    expect(result[0].role).toBe("system");
  });

  it("applies window size", () => {
    const session: Session = {
      id: "1",
      title: "t",
      createdAt: "",
      updatedAt: "",
      messages: Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `m${i}`,
        timestamp: ""
      })) as any
    };
    const result = ContextBuilder.build(session, "system prompt", 20);
    expect(result).toHaveLength(21);
  });

  it("uses summary if present", () => {
    const session: Session = {
      id: "1",
      title: "t",
      createdAt: "",
      updatedAt: "",
      summary: "sum",
      summaryUpToIndex: 1,
      messages: [
        { role: "user", content: "a", timestamp: "" },
        { role: "assistant", content: "b", timestamp: "" },
        { role: "user", content: "c", timestamp: "" }
      ]
    };
    const result = ContextBuilder.build(session, "system", 20);
    expect(result[1].content).toContain("sum");
    expect(result[result.length - 1].content).toBe("c");
  });
});