import { SessionStore } from "../../src/storage/SessionStore";
import { createFakeVault } from "../helpers/fakeVault";

describe("SessionStore", () => {
  it("creates and lists sessions", async () => {
    const { vault } = createFakeVault();
    const store = new SessionStore(vault, ".llm-wiki/sessions");

    const created = await store.createSession();
    expect(created.id).toContain("session-");
    expect(created.title).toBe("New Session");

    const sessions = await store.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(created.id);
  });

  it("loads and updates title", async () => {
    const { vault } = createFakeVault();
    const store = new SessionStore(vault, ".llm-wiki/sessions");

    const created = await store.createSession();
    await store.updateTitle(created.id, "Renamed");

    const loaded = await store.loadSession(created.id);
    expect(loaded.title).toBe("Renamed");
  });

  it("applies max message cap in appendMessage", async () => {
    const { vault } = createFakeVault();
    const store = new SessionStore(vault, ".llm-wiki/sessions");
    const created = await store.createSession();

    for (let i = 0; i < 6; i++) {
      await store.appendMessage(
        created.id,
        { role: "user", content: `m${i}`, timestamp: String(i) },
        5
      );
    }

    const loaded = await store.loadSession(created.id);
    expect(loaded.messages).toHaveLength(4);
    expect(loaded.messages[0].content).toBe("m2");
    expect(loaded.messages[3].content).toBe("m5");
  });

  it("deletes session and removes it from index", async () => {
    const { vault } = createFakeVault();
    const store = new SessionStore(vault, ".llm-wiki/sessions");

    const a = await store.createSession();
    const b = await store.createSession();
    await store.deleteSession(a.id);

    const sessions = await store.listSessions();
    expect(sessions.map((s) => s.id)).toEqual([b.id]);
    await expect(store.loadSession(a.id)).rejects.toThrow();
  });
});