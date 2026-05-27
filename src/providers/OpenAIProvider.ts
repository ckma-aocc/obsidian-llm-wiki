import { Notice } from "obsidian";
import type { ChatMessage, LLMWikiSettings } from "../types";
import type { ChatOptions, LLMProvider } from "./LLMProvider";
import { parseSSE } from "./ProviderUtils";
import { resolveProviderConfig } from "../settings/Settings";

export class OpenAIProvider implements LLMProvider {
  constructor(private settings: LLMWikiSettings) {}

  private buildAzureChatUrl(baseUrl: string, deploymentName: string, apiVersion: string): string {
    let url = baseUrl.trim();
    if (!url) {
      throw new Error("Azure OpenAI requires Base URL");
    }

    // Accept either a resource endpoint or a full deployments path.
    if (!/\/openai\/deployments\//i.test(url)) {
      url = `${url.replace(/\/+$/, "")}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`;
    }

    const sep = url.includes("?") ? "&" : "?";
    if (!/[?&]api-version=/i.test(url)) {
      url = `${url}${sep}api-version=${encodeURIComponent(apiVersion)}`;
    }
    return url;
  }

  async *chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
    const config = resolveProviderConfig(this.settings);

    if (!config.apiKey) {
      new Notice("Missing API key. Configure it in LLM Wiki settings.");
      throw new Error("Missing API key");
    }

    if (!config.model?.trim()) {
      new Notice("Missing model/deployment name. Configure it in LLM Wiki settings.");
      throw new Error("Missing model/deployment name");
    }

    const configuredBaseUrl = config.baseUrl?.trim() || "";
    const isAzure = /openai\.azure\.com/i.test(configuredBaseUrl);

    let url: string;
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (isAzure) {
      url = this.buildAzureChatUrl(
        configuredBaseUrl,
        config.model,
        config.azureApiVersion || "2024-10-21"
      );
      headers["api-key"] = config.apiKey;
    } else {
      url = configuredBaseUrl || "https://api.openai.com/v1/chat/completions";
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...(isAzure ? {} : { model: config.model }),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts?.temperature ?? 0.2,
        stream: true
      })
    });

    for await (const payload of parseSSE(response)) {
      const json = JSON.parse(payload);
      const content = json.choices?.[0]?.delta?.content;
      if (content) {
        yield content as string;
      }
    }
  }
}