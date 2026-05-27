import type { ChatMessage } from "../types";

export interface ChatOptions {
  temperature?: number;
}

export interface LLMProvider {
  chat(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
}