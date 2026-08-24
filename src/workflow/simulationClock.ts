const DAY_MS = 24 * 60 * 60 * 1000;

export interface ClockSpeed {
  id: string;
  label: string;
  /** Simulated milliseconds that pass per real second. 0 means paused. */
  simMsPerRealSecond: number;
}

/**
 * A 3-day SLA is not a thing you can wait out in a demo, so the timers count
 * against a compressed clock instead of wall time. Everything else about the
 * boundary timer is real — the engine arms it, the deadline is the P3D from
 * the file, and it fires on its own.
 */
export const CLOCK_SPEEDS: ClockSpeed[] = [
  { id: "paused", label: "Paused", simMsPerRealSecond: 0 },
  { id: "slow", label: "1 day / 4s", simMsPerRealSecond: DAY_MS / 4 },
  { id: "medium", label: "1 day / 2s", simMsPerRealSecond: DAY_MS / 2 },
  { id: "fast", label: "1 day / 1s", simMsPerRealSecond: DAY_MS },
];

export const DEFAULT_SPEED_ID = "medium";

/** A monotonic clock that only moves when something advances it. */
export class SimulationClock {
  private simTime = 0;
  private simMsPerRealSecond = 0;

  now = (): number => this.simTime;

  setSpeed(simMsPerRealSecond: number): void {
    this.simMsPerRealSecond = simMsPerRealSecond;
  }

  isRunning(): boolean {
    return this.simMsPerRealSecond > 0;
  }

  /** Back to zero, for a fresh instance. */
  reset(): void {
    this.simTime = 0;
  }

  /** Move simulated time forward by however much real time just passed. */
  advance(realDeltaMs: number): void {
    this.simTime += (realDeltaMs / 1000) * this.simMsPerRealSecond;
  }
}

/** "2d 4h" / "3h 20m" / "45s" — compact enough for a countdown badge. */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
