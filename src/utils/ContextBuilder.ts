import type { ChatMessage, Session } from "../types";

export class ContextBuilder {
  static build(session: Session, systemPrompt: string, windowSize: number): ChatMessage[] {
    const base: ChatMessage[] = [{ role: "system", content: systemPrompt, timestamp: "" }];
    let messages = session.messages;
    if (session.summary !== undefined && session.summaryUpToIndex !== undefined) {
      base.push({ role: "system", content: `[Session Summary]\n${session.summary}`, timestamp: "" });
      messages = messages.slice(session.summaryUpToIndex + 1);
    }
    return base.concat(messages.slice(-windowSize));
  }
}