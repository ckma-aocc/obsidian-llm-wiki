import { AutoWatcher } from "../../../src/features/ingest/AutoWatcher";

describe("AutoWatcher", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it("does not register create handler when autoIngest is disabled", () => {
    const on = jest.fn();
    const vault = { on } as any;
    const watcher = new AutoWatcher(
      vault,
      {
        autoIngest: false,
        autoIngestDebounceMs: 50,
        rawSourcesPath: "raw"
      } as any,
      async () => undefined
    );

    watcher.start();
    expect(on).not.toHaveBeenCalled();
  });

  it("flushes all created files in a debounce window", async () => {
    const eventRef = { id: "evt" };
    const vault = {
      on: jest.fn((_name: string, handler: (file: any) => Promise<void>) => eventRef),
      offref: jest.fn()
    } as any;

    const onNewRawFile = jest.fn().mockResolvedValue(undefined);
    const watcher = new AutoWatcher(
      vault,
      {
        autoIngest: true,
        autoIngestDebounceMs: 100,
        rawSourcesPath: "raw"
      } as any,
      onNewRawFile
    );

    watcher.start();
    const handler = vault.on.mock.calls[0][1] as (file: any) => Promise<void>;
    await handler({ path: "raw/a.md" });
    await handler({ path: "raw/b.md" });
    await handler({ path: "raw/c.md" });

    jest.advanceTimersByTime(110);
    await Promise.resolve();
    await Promise.resolve();

    expect(onNewRawFile).toHaveBeenCalledTimes(3);
    expect(onNewRawFile).toHaveBeenNthCalledWith(1, "raw/a.md");
    expect(onNewRawFile).toHaveBeenNthCalledWith(2, "raw/b.md");
    expect(onNewRawFile).toHaveBeenNthCalledWith(3, "raw/c.md");
  });

  it("ignores files outside rawSourcesPath", async () => {
    const vault = {
      on: jest.fn((_name: string, handler: (file: any) => Promise<void>) => ({ id: "evt" })),
      offref: jest.fn()
    } as any;

    const onNewRawFile = jest.fn().mockResolvedValue(undefined);
    const watcher = new AutoWatcher(
      vault,
      {
        autoIngest: true,
        autoIngestDebounceMs: 50,
        rawSourcesPath: "raw"
      } as any,
      onNewRawFile
    );

    watcher.start();
    const handler = vault.on.mock.calls[0][1] as (file: any) => Promise<void>;
    await handler({ path: "other/x.md" });

    jest.advanceTimersByTime(60);
    await Promise.resolve();

    expect(onNewRawFile).not.toHaveBeenCalled();
  });
});
