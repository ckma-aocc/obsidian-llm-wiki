import type { ChatMessage, LLMWikiSettings } from "../types";
import type { ChatOptions, LLMProvider } from "./LLMProvider";
import { resolveProviderConfig } from "../settings/Settings";

export class OllamaProvider implements LLMProvider {
  constructor(private settings: LLMWikiSettings) {}

  async *chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
    const config = resolveProviderConfig(this.settings);
    const url = config.baseUrl || "http://127.0.0.1:11434/api/chat";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        options: { temperature: opts?.temperature ?? 0.2 }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }
    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const json = JSON.parse(line);
        const content = json.message?.content;
        if (content) {
          yield content as string;
        }
      }
    }
  }
}