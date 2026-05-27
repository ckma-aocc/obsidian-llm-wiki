export type LintSchedule = "off" | "daily" | "weekly";

const INTERVAL_MS: Record<Exclude<LintSchedule, "off">, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000
};

export interface LintSchedulerOptions {
  schedule: LintSchedule;
  timeOfDay: string;
  catchUpOnStartup: boolean;
  lastRunAt?: string;
  onTick: () => Promise<void>;
  onDidRun?: (isoTs: string) => Promise<void>;
}

export interface LintSchedulerHandle {
  stop: () => void;
}

function parseTime(timeOfDay: string): { hours: number; minutes: number } {
  const match = timeOfDay.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return { hours: 9, minutes: 0 };
  }
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function nextRunAt(now: Date, schedule: Exclude<LintSchedule, "off">, timeOfDay: string, anchorDay: number): Date {
  const { hours, minutes } = parseTime(timeOfDay);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (schedule === "daily") {
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  const currentDay = now.getDay();
  let delta = anchorDay - currentDay;
  if (delta < 0 || (delta === 0 && next.getTime() <= now.getTime())) {
    delta += 7;
  }
  next.setDate(next.getDate() + delta);
  return next;
}

export class LintScheduler {
  static start(options: LintSchedulerOptions): LintSchedulerHandle {
    if (options.schedule === "off") {
      return { stop: () => undefined };
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = options.schedule;
    const interval = INTERVAL_MS[schedule];
    const anchorDay = options.lastRunAt ? new Date(options.lastRunAt).getDay() : new Date().getDay();

    const runOnce = async (): Promise<void> => {
      await options.onTick();
      if (options.onDidRun) {
        await options.onDidRun(new Date().toISOString());
      }
    };

    const planNext = () => {
      if (stopped) return;
      const now = new Date();
      const next = nextRunAt(now, schedule, options.timeOfDay, anchorDay);
      const delay = Math.max(1_000, next.getTime() - now.getTime());
      timer = globalThis.setTimeout(async () => {
        try {
          await runOnce();
        } catch (error) {
          console.warn("Auto-lint error", error);
        }
        planNext();
      }, delay);
    };

    if (options.catchUpOnStartup && options.lastRunAt) {
      const last = new Date(options.lastRunAt).getTime();
      if (!Number.isNaN(last)) {
        const now = Date.now();
        if (now - last >= interval) {
          void runOnce().catch((error) => console.warn("Auto-lint startup catch-up error", error));
        }
      }
    }

    planNext();

    return {
      stop: () => {
        stopped = true;
        if (timer !== null) {
          globalThis.clearTimeout(timer);
          timer = null;
        }
      }
    };
  }

  static register(
    schedule: LintSchedule,
    registerInterval: (cb: () => void, ms: number) => number,
    onTick: () => Promise<void>
  ): void {
    if (schedule === "off") return;
    registerInterval(() => {
      onTick().catch((error) => console.warn("Auto-lint error", error));
    }, INTERVAL_MS[schedule]);
  }
}