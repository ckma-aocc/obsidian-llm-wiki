import { LintScheduler } from "../../../src/features/lint/LintScheduler";

describe("LintScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not register interval when off", () => {
    const register = jest.fn();
    LintScheduler.register("off", register, async () => undefined);
    expect(register).not.toHaveBeenCalled();
  });

  it("registers daily interval and invokes callback", async () => {
    let cb: (() => void) | undefined;
    let ms = 0;
    const register = jest.fn((fn: () => void, interval: number) => {
      cb = fn;
      ms = interval;
      return 1;
    });
    const tick = jest.fn().mockResolvedValue(undefined);

    LintScheduler.register("daily", register, tick);

    expect(ms).toBe(24 * 60 * 60 * 1000);
    expect(cb).toBeTruthy();
    if (cb) cb();
    await Promise.resolve();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("registers weekly interval", () => {
    let ms = 0;
    const register = jest.fn((_fn: () => void, interval: number) => {
      ms = interval;
      return 1;
    });

    LintScheduler.register("weekly", register, async () => undefined);
    expect(ms).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("start schedules daily run at fixed time and invokes onTick", async () => {
    jest.setSystemTime(new Date("2026-05-25T08:00:00.000Z"));
    const onTick = jest.fn().mockResolvedValue(undefined);
    const onDidRun = jest.fn().mockResolvedValue(undefined);

    const handle = LintScheduler.start({
      schedule: "daily",
      timeOfDay: "09:00",
      catchUpOnStartup: false,
      onTick,
      onDidRun
    });

    await jest.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);

    expect(onTick).toHaveBeenCalled();
    expect(onDidRun).toHaveBeenCalled();
    handle.stop();
  });

  it("start performs startup catch-up when enabled and missed interval", async () => {
    jest.setSystemTime(new Date("2026-05-25T10:00:00.000Z"));
    const onTick = jest.fn().mockResolvedValue(undefined);

    const handle = LintScheduler.start({
      schedule: "daily",
      timeOfDay: "09:00",
      catchUpOnStartup: true,
      lastRunAt: "2026-05-23T09:00:00.000Z",
      onTick
    });

    await Promise.resolve();
    expect(onTick).toHaveBeenCalledTimes(1);
    handle.stop();
  });
});