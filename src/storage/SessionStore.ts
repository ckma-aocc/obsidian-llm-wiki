import type { ChatMessage, Session } from "../types";

interface SessionIndex {
  sessions: Array<{ id: string; title: string; updatedAt: string }>;
}

export class SessionStore {
  private indexPath: string;

  constructor(private vault: any, private sessionsPath: string) {
    this.indexPath = `${sessionsPath}/sessions-index.json`;
  }

  async createSession(): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: "New Session",
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    await this.ensureDirectory();
    await this.saveSession(session);
    await this.upsertIndex(session.id, session.title, session.updatedAt);
    return session;
  }

  async saveSession(session: Session): Promise<void> {
    const path = `${this.sessionsPath}/${session.id}.json`;
    await this.ensureDirectory();
    await this.vault.adapter.write(path, JSON.stringify(session, null, 2));
    await this.upsertIndex(session.id, session.title, session.updatedAt);
  }

  async loadSession(id: string): Promise<Session> {
    const raw = await this.vault.adapter.read(`${this.sessionsPath}/${id}.json`);
    return JSON.parse(raw) as Session;
  }

  async listSessions(): Promise<SessionIndex["sessions"]> {
    const exists = await this.vault.adapter.exists(this.indexPath);
    if (!exists) return [];
    const raw = await this.vault.adapter.read(this.indexPath);
    const parsed = JSON.parse(raw) as SessionIndex;
    return parsed.sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async appendMessage(id: string, message: ChatMessage, maxMessages: number): Promise<Session> {
    const session = await this.loadSession(id);
    session.messages.push(message);
    session.updatedAt = new Date().toISOString();
    if (session.messages.length > maxMessages) {
      session.messages = session.messages.slice(-(maxMessages - 1));
    }
    await this.saveSession(session);
    return session;
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const session = await this.loadSession(id);
    session.title = title;
    session.updatedAt = new Date().toISOString();
    await this.saveSession(session);
  }

  async deleteSession(id: string): Promise<void> {
    const path = `${this.sessionsPath}/${id}.json`;
    if (await this.vault.adapter.exists(path)) {
      if (typeof this.vault.adapter.remove === "function") {
        await this.vault.adapter.remove(path);
      }
    }

    const sessions = await this.listSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    await this.vault.adapter.write(this.indexPath, JSON.stringify({ sessions: filtered }, null, 2));
  }

  private async ensureDirectory(): Promise<void> {
    const exists = await this.vault.adapter.exists(this.sessionsPath);
    if (!exists) {
      await this.vault.adapter.mkdir(this.sessionsPath);
    }
  }

  private async upsertIndex(id: string, title: string, updatedAt: string): Promise<void> {
    const sessions = await this.listSessions();
    const found = sessions.find((s) => s.id === id);
    if (found) {
      found.title = title;
      found.updatedAt = updatedAt;
    } else {
      sessions.unshift({ id, title, updatedAt });
    }
    await this.vault.adapter.write(this.indexPath, JSON.stringify({ sessions }, null, 2));
  }
}