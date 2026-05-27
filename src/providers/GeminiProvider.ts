import { Notice } from "obsidian";
import type { ChatMessage, LLMWikiSettings } from "../types";
import type { ChatOptions, LLMProvider } from "./LLMProvider";
import { parseSSE } from "./ProviderUtils";
import { resolveProviderConfig } from "../settings/Settings";

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

export class GeminiProvider implements LLMProvider {
  constructor(private settings: LLMWikiSettings) {}

  private extractText(payload: unknown): string {
    const responses = Array.isArray(payload) ? payload : [payload];
    const chunks: string[] = [];

    for (const item of responses) {
      const json = item as GeminiResponse;
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.text) {
          chunks.push(part.text);
        }
      }
    }

    return chunks.join("");
  }

  private async parseError(response: Response): Promise<string> {
    const raw = await response.text();
    if (!raw) return `HTTP ${response.status}: ${response.statusText}`;
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
      const message = parsed.error?.message?.trim();
      const status = parsed.error?.status?.trim();
      if (message && status) return `HTTP ${response.status} ${status}: ${message}`;
      if (message) return `HTTP ${response.status}: ${message}`;
      return `HTTP ${response.status}: ${raw}`;
    } catch {
      return `HTTP ${response.status}: ${raw}`;
    }
  }

  async *chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
    const config = resolveProviderConfig(this.settings);

    if (!config.apiKey) {
      new Notice("Missing API key. Configure it in LLM Wiki settings.");
      throw new Error("Missing API key");
    }

    if (!config.model?.trim()) {
      new Notice("Missing model name. Configure it in LLM Wiki settings.");
      throw new Error("Missing model name");
    }

    const base = (config.baseUrl?.trim() || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
    const model = config.model.trim();
    const streamUrl = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const generateUrl = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const systemParts = messages
      .filter((m) => m.role === "system")
      .map((m) => ({ text: m.content }));

    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: opts?.temperature ?? 0.2
      }
    };

    if (systemParts.length > 0) {
      body.systemInstruction = { parts: systemParts };
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey
    };

    const streamResponse = await fetch(streamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!streamResponse.ok) {
      const detail = await this.parseError(streamResponse);
      new Notice(`Gemini request failed: ${detail}`);
      throw new Error(detail);
    }

    let hasText = false;

    for await (const payload of parseSSE(streamResponse)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      const text = this.extractText(parsed);
      if (text) {
        hasText = true;
        yield text;
      }
    }

    // Some gateways/proxies do not pass SSE chunks correctly. Fallback to non-stream call.
    if (hasText) return;

    const generateResponse = await fetch(generateUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });

    if (!generateResponse.ok) {
      const detail = await this.parseError(generateResponse);
      new Notice(`Gemini request failed: ${detail}`);
      throw new Error(detail);
    }

    const parsed = (await generateResponse.json()) as GeminiResponse;
    const text = this.extractText(parsed);
    if (!text) {
      throw new Error("Gemini returned no text content.");
    }

    yield text;
  }
}
