import type { Vault } from "obsidian";
import type { LLMWikiSettings } from "../../types";

export class AutoWatcher {
  private eventRef: any = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingPaths = new Set<string>();

  constructor(
    private vault: Vault,
    private settings: LLMWikiSettings,
    private onNewRawFile: (path: string) => Promise<void>
  ) {}

  updateSettings(settings: LLMWikiSettings): void {
    this.settings = settings;
  }

  start(registerEvent?: (evt: any) => void): void {
    this.stop();
    if (!this.settings.autoIngest) return;
    const eventRef = this.vault.on("create", async (file: any) => {
      if (!this.isPathInRawSources(file?.path)) return;
      this.pendingPaths.add(file.path);
      if (this.timer !== null) {
        globalThis.clearTimeout(this.timer);
      }
      this.timer = globalThis.setTimeout(() => {
        void this.flushPendingPaths();
      }, this.settings.autoIngestDebounceMs);
    });
    this.eventRef = eventRef;
    if (registerEvent) {
      registerEvent(eventRef);
    }
  }

  stop(): void {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingPaths.clear();
    if (this.eventRef && typeof (this.vault as any).offref === "function") {
      (this.vault as any).offref(this.eventRef);
    }
    this.eventRef = null;
  }

  register(registerEvent: (evt: any) => void): void {
    this.start(registerEvent);
  }

  private isPathInRawSources(path: string | undefined): boolean {
    if (!path) return false;
    const normalizedPath = path.replace(/\\/g, "/");
    const root = this.settings.rawSourcesPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!root) return false;
    return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
  }

  private async flushPendingPaths(): Promise<void> {
    this.timer = null;
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();
    for (const path of paths) {
      try {
        await this.onNewRawFile(path);
      } catch (error) {
        console.warn("Auto ingest failed for", path, error);
      }
    }
  }
}