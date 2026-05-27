import { Notice } from "obsidian";
import type { ChatMessage, LLMWikiSettings } from "../types";
import type { ChatOptions, LLMProvider } from "./LLMProvider";
import { parseSSE } from "./ProviderUtils";
import { resolveProviderConfig } from "../settings/Settings";

export class AnthropicProvider implements LLMProvider {
  constructor(private settings: LLMWikiSettings) {}

  async *chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
    const config = resolveProviderConfig(this.settings);

    if (!config.apiKey) {
      new Notice("Missing API key. Configure it in LLM Wiki settings.");
      throw new Error("Missing API key");
    }

    const url = config.baseUrl || "https://api.anthropic.com/v1/messages";
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const nonSystem = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: config.model,
        system,
        messages: nonSystem,
        max_tokens: 2048,
        temperature: opts?.temperature ?? 0.2,
        stream: true
      })
    });

    for await (const payload of parseSSE(response)) {
      const json = JSON.parse(payload);
      const content = json.delta?.text;
      if (content) {
        yield content as string;
      }
    }
  }
}